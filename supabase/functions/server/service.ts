import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { researchState, runResearch } from "./research.ts";
import { validateResearchSettings, type ResearchReport } from "../../../shared/research.ts";
import { vehicleIds } from "../../../shared/fare-model.ts";
import { computeOperatingCosts, type CostBasis } from "../../../shared/operating-costs.ts";
import type { CostSnapshot } from "../../../shared/fare-model.ts";
import { calculateEstimate, prototypeRates, validateOfficialFares, validateProfiles, validateSnapshot, type CostDataResponse, type FareCatalog, type VehicleId } from "../../../shared/fare-model.ts";
const app = new Hono();
const prefix = "/make-server-0510dbc7";
const dailyInterval = 24 * 60 * 60 * 1000;
let updateInFlight: Promise<void> | null = null;

async function catalog(): Promise<FareCatalog> {
  return await kv.get("fares:catalog") ?? { profiles: prototypeRates, official: [], modelStatus: "prototype", updatedAt: null };
}

async function saveSnapshot(input: unknown) {
  const snapshot = validateSnapshot(input);
  const previous = await kv.get("costs:latest");
  if (previous && Date.parse(snapshot.observedAt) < Date.parse(previous.snapshot.observedAt)) throw new Error("Cannot replace newer cost data with an older snapshot");
  await kv.set(`costs:history:${snapshot.observedAt.slice(0, 10)}`, snapshot);
  await kv.set("costs:latest", { snapshot, checkedAt: new Date().toISOString() });
}

async function refreshFeed() {
  const feed = Deno.env.get("COST_DATA_API_URL");
  if (!feed || new URL(feed).protocol !== "https:") throw new Error("Configure an HTTPS COST_DATA_API_URL first");
  const apiKey = Deno.env.get("COST_DATA_API_KEY");
  const response = await fetch(feed, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw new Error("Cost provider failed to respond successfully");
  const body = await response.text();
  if (body.length > 100000) throw new Error("Cost feed response is too large");
  await saveSnapshot(JSON.parse(body));
}

async function refreshOnce() {
  if (!updateInFlight) updateInFlight = refreshFeed().finally(() => { updateInFlight = null; });
  return updateInFlight;
}

async function costs(refresh = false): Promise<CostDataResponse> {
  let stored = await kv.get("costs:latest");
  const configured = Boolean(Deno.env.get("COST_DATA_API_URL"));
  if (refresh && configured && (!stored || Date.now() - Date.parse(stored.checkedAt) >= dailyInterval)) {
    const lastAttempt = await kv.get("costs:last-attempt");
    if (!lastAttempt || Date.now() - Date.parse(lastAttempt) > 60 * 60 * 1000) {
      await kv.set("costs:last-attempt", new Date().toISOString());
      try { await refreshOnce(); stored = await kv.get("costs:latest"); }
      catch (error) { console.error("Cost update failed", error); return { snapshot: stored?.snapshot ?? null, status: stored ? "stale" : "unavailable", checkedAt: stored?.checkedAt }; }
    }
  }
  return {
    snapshot: stored?.snapshot ?? null,
    status: stored ? (Date.now() - Date.parse(stored.snapshot.observedAt) < dailyInterval ? "current" : "stale") : configured ? "unavailable" : "unconfigured",
    checkedAt: stored?.checkedAt,
  };
}

async function readBody(request: Request) {
  const body = await request.text();
  if (body.length > 100000) throw new Error("Request body is too large");
  try { return JSON.parse(body); } catch { throw new Error("Invalid JSON body"); }
}

async function isAdmin(authorization: string | undefined) {
  const token = authorization?.replace(/^Bearer /, "");
  const allowed = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!token || !allowed.length) return false;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await client.auth.getUser(token);
  return !error && Boolean(data.user?.email_confirmed_at && data.user.email && allowed.includes(data.user.email.toLowerCase()));
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "X-Refresh-Secret"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

app.onError((error, c) => {
  console.error("Fare service error", error);
  return c.json({ error: "The service is temporarily unavailable. Try again shortly." }, 500);
});

app.use(`${prefix}/admin/*`, async (c, next) => {
  if (!await isAdmin(c.req.header("Authorization"))) return c.json({ error: "Sign in with an authorized administrator account" }, 403);
  await next();
});

app.get(`${prefix}/fares`, async (c) => c.json(await catalog()));
app.get(`${prefix}/costs`, async (c) => c.json(await costs(true)));
app.get(`${prefix}/costs/history`, async (c) => {
  const rows = await kv.getByPrefix("costs:history:");
  return c.json(rows.sort((first, second) => Date.parse(second.observedAt) - Date.parse(first.observedAt)).slice(0, 30));
});
app.post(`${prefix}/estimates`, async (c) => {
  let input;
  try { input = await readBody(c.req.raw); } catch (error) { return c.json({ error: (error as Error).message }, 400); }
  const rates = await catalog();
  const currentCosts = await costs(true);
  try { return c.json(calculateEstimate(input?.vehicleId as VehicleId, input?.distance, rates, currentCosts)); }
  catch (error) { return c.json({ error: (error as Error).message }, 400); }
});

app.get(`${prefix}/admin/status`, async (c) => c.json({ feedConfigured: Boolean(Deno.env.get("COST_DATA_API_URL")), schedulerSecretConfigured: Boolean(Deno.env.get("COST_REFRESH_SECRET")), costs: await costs(), catalog: await catalog() }));
app.put(`${prefix}/admin/fares`, async (c) => {
  let values;
  try {
    const input = await readBody(c.req.raw);
    values = { profiles: validateProfiles(input.profiles), official: validateOfficialFares(input.official), modelStatus: "configured" as const, updatedAt: new Date().toISOString() };
  } catch (error) { return c.json({ error: (error as Error).message }, 400); }
  await kv.set("fares:catalog", values);
  return c.json(values);
});
app.put(`${prefix}/admin/costs`, async (c) => {
  let snapshot;
  try { snapshot = validateSnapshot(await readBody(c.req.raw)); } catch (error) { return c.json({ error: (error as Error).message }, 400); }
  await saveSnapshot(snapshot);
  return c.json(await costs());
});
app.post(`${prefix}/admin/refresh`, async (c) => {
  try { await refreshOnce(); return c.json(await costs()); }
  catch (error) { return c.json({ error: (error as Error).message }, 502); }
});
app.get(`${prefix}/admin/research`, async (c) => c.json(await researchState()));
app.get(`${prefix}/admin/cost-bases`, async (c) => c.json(await kv.get("costs:bases") ?? {}));
app.post(`${prefix}/admin/cost-bases`, async (c) => {
  let input;
  let computed;
  try {
    input = await readBody(c.req.raw);
    if (!vehicleIds.includes(input.vehicleId)) throw new Error("Choose a valid vehicle category");
    computed = computeOperatingCosts(input.basis);
    if (input.vehicleId !== "bus" && computed.basis.fareUnits !== 1) throw new Error("Hired vehicles must use one fare unit");
  } catch (error) { return c.json({ error: (error as Error).message }, 400); }
  const stored = await kv.get("costs:bases") ?? {};
  stored[input.vehicleId] = { basis: computed.basis, reviewedAt: new Date().toISOString() };
  await kv.set("costs:bases", stored);
  try {
    const previous = (await costs()).snapshot;
    const observedAt = new Date().toISOString();
    const vehicles: CostSnapshot["vehicles"] = previous?.location === computed.basis.location ? Object.fromEntries(Object.entries(previous.vehicles).map(([id, row]) => [id, { ...row, observedAt: row!.observedAt ?? previous.observedAt }])) : {};
    vehicles[input.vehicleId as VehicleId] = { observedAt, fuelPerKm: computed.fuelPerKm, maintenancePerKm: computed.maintenancePerKm, otherPerKm: computed.otherPerKm, breakdown: computed.breakdown, basis: computed.basis, sourceUrls: computed.sourceUrls };
    await saveSnapshot({ observedAt, location: computed.basis.location, vehicles });
    return c.json({ published: true, computed, remaining: vehicleIds.filter((id) => !vehicles[id]) });
  } catch (error) { return c.json({ error: `Worksheet saved, but publication needs review: ${(error as Error).message}` }, 400); }
});
app.put(`${prefix}/admin/research/settings`, async (c) => {
  let settings;
  try { settings = validateResearchSettings(await readBody(c.req.raw)); } catch (error) { return c.json({ error: (error as Error).message }, 400); }
  await kv.set("research:settings", settings);
  return c.json(await researchState());
});
app.post(`${prefix}/admin/research/run`, async (c) => {
  try { return c.json(await runResearch()); } catch (error) { return c.json({ error: (error as Error).message }, 502); }
});
app.post(`${prefix}/admin/research/review`, async (c) => {
  let input;
  try { input = await readBody(c.req.raw); } catch (error) { return c.json({ error: (error as Error).message }, 400); }
  const state = await researchState();
  const report: ResearchReport | null = state.report;
  if (!report || report.id !== input.reportId || report.status !== "pending") return c.json({ error: "This report is missing or has already been reviewed" }, 409);
  if (input.action === "reject") {
    const rejected = { ...report, status: "rejected" };
    await kv.set("research:latest", rejected); await kv.set(`research:history:${report.id}`, rejected);
    return c.json(await researchState());
  }
  if (input.action !== "approve" || input.confirmEvidence !== true) return c.json({ error: "Confirm the cited price evidence before approval" }, 400);
  if (report.location !== state.settings.location) return c.json({ error: "Research location changed; collect a new report before publishing" }, 409);
  const baseline = (await costs()).snapshot;
  if (!baseline || baseline.location !== report.location) return c.json({ error: "Publish documented maintenance/other baseline costs for this exact location first" }, 400);
  try {
    const settings = validateResearchSettings(state.settings);
    const vehicles = Object.fromEntries(vehicleIds.filter((id) => baseline.vehicles[id]).map((id) => {
      const baselineRow = baseline.vehicles[id]!;
      const profile = settings.profiles[id];
      if (!profile) throw new Error(`Documented fuel efficiency is required for ${id}`);
      const price = report.fuelPrices.find((item) => item.name === profile.fuel);
      if (!price || Date.now() - Date.parse(price.effectiveDate) > 48 * 60 * 60 * 1000) throw new Error(`A recent ${profile.fuel} finding is required for ${id}`);
      const baselineSources = baselineRow.sourceUrls.filter((source) => !baseline.fuelPrices?.some((previousPrice) => previousPrice.sourceUrl === source));
      const previousBasis = baselineRow.basis;
      if (previousBasis && previousBasis.fareUnits !== profile.fareUnits) throw new Error(`Recalculate the full ${id} worksheet before changing its fare-unit allocation`);
      const fuelPerKm = price.price / profile.kmPerLitre / profile.fareUnits;
      const basis: CostBasis | undefined = previousBasis ? { ...previousBasis, fuelPrice: price.price, kmPerLitre: profile.kmPerLitre, efficiencySourceUrl: profile.sourceUrl, evidence: { ...previousBasis.evidence, fuel: { sourceUrl: price.sourceUrl, effectiveDate: price.effectiveDate, note: `Reviewed Gemini fuel finding. Efficiency evidence: ${profile.sourceUrl}` } } } : undefined;
      return [id, { ...baselineRow, observedAt: new Date().toISOString(), fuelPerKm, basis, breakdown: baselineRow.breakdown ? { ...baselineRow.breakdown, fuel: fuelPerKm } : undefined, sourceUrls: [...new Set([...baselineSources, price.sourceUrl, profile.sourceUrl])] }];
    }));
    const snapshot = { observedAt: new Date().toISOString(), location: report.location, vehicles, fuelPrices: report.fuelPrices.map((item) => ({ name: item.name, price: item.price, unit: "INR/litre", sourceUrl: item.sourceUrl, effectiveDate: item.effectiveDate })), research: { reportId: report.id, baselineObservedAt: baseline.research?.baselineObservedAt ?? baseline.observedAt, researchedAt: report.researchedAt } };
    await saveSnapshot(snapshot);
    const storedBases = await kv.get("costs:bases") ?? {};
    for (const [id, costs] of Object.entries(vehicles)) if (costs.basis) storedBases[id] = { basis: costs.basis, reviewedAt: new Date().toISOString() };
    await kv.set("costs:bases", storedBases);
  } catch (error) { return c.json({ error: (error as Error).message }, 400); }
  const approved = { ...report, status: "approved" };
  await kv.set("research:latest", approved); await kv.set(`research:history:${report.id}`, approved);
  return c.json(await researchState());
});
app.post(`${prefix}/costs/refresh`, async (c) => {
  const secret = Deno.env.get("COST_REFRESH_SECRET");
  if (!secret || c.req.header("X-Refresh-Secret") !== secret) return c.json({ error: "Unauthorized" }, 401);
  try {
    if (Deno.env.get("COST_DATA_API_URL")) { await refreshOnce(); return c.json({ status: "updated" }); }
    const state = await researchState();
    if (!state.settings.enabled) return c.json({ error: "Enable Gemini daily research in the admin area first" }, 400);
    const report = await runResearch();
    return c.json({ status: "research_completed", reportStatus: report.status, published: false });
  }
  catch (error) { console.error("Scheduled refresh failed", error); return c.json({ error: "Update failed; previous verified snapshot retained" }, 502); }
});

// Health check endpoint
app.get("/make-server-0510dbc7/health", (c) => {
  return c.json({ status: "ok" });
});

export default app;
