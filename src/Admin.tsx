import { useState, type FormEvent } from "react";
import { apiRequest, signInAdmin } from "./api";
import { prototypeRates, vehicleIds, type CostDataResponse, type FareCatalog, type RateProfiles } from "../shared/fare-model";
import ResearchPanel from "./ResearchPanel";
import CostWorksheet from "./CostWorksheet";

type AdminStatus = { feedConfigured: boolean; schedulerSecretConfigured: boolean; costs: CostDataResponse; catalog: FareCatalog };
const labels = { auto: "Auto Rickshaw", cab: "Motor Cab", maxicab: "Maxicab", contract: "Contract Carriage", bus: "Stage Carriage" };

export default function Admin({ onSaved }: { onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [profiles, setProfiles] = useState<RateProfiles>(prototypeRates);
  const [official, setOfficial] = useState("[]");
  const [location, setLocation] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [observedAt, setObservedAt] = useState(new Date().toISOString().slice(0, 16));
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const hydrate = (value: AdminStatus) => {
    setStatus(value);
    setProfiles(value.catalog.profiles);
    setOfficial(JSON.stringify(value.catalog.official, null, 2));
    if (value.costs.snapshot) {
      setLocation(value.costs.snapshot.location);
      setSourceUrl(Object.values(value.costs.snapshot.vehicles)[0]?.sourceUrls[0] ?? "");
      setObservedAt(value.costs.snapshot.observedAt.slice(0, 16));
      setInputs(Object.fromEntries(vehicleIds.flatMap((id) => ["fuelPerKm", "maintenancePerKm", "otherPerKm"].map((field) => [`${id}:${field}`, String(value.costs.snapshot!.vehicles[id]?.[field as "fuelPerKm"] ?? "")]))));
    }
  };

  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setMessage(""); setError("");
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Request failed"); }
    finally { setBusy(false); }
  };

  const login = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const accessToken = await signInAdmin(email, password);
      const value = await apiRequest<AdminStatus>("/admin/status", {}, accessToken);
      hydrate(value); setToken(accessToken); setPassword("");
    });
  };

  const saveRates = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const catalog = await apiRequest<FareCatalog>("/admin/fares", { method: "PUT", body: JSON.stringify({ profiles, official: JSON.parse(official) }) }, token!);
      setStatus((value) => value && ({ ...value, catalog }));
      setMessage("Fare model saved. New calculations use these rates."); onSaved();
    });
  };

  const saveCosts = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const vehicles = Object.fromEntries(vehicleIds.map((id) => [id, {
        fuelPerKm: Number(inputs[`${id}:fuelPerKm`]), maintenancePerKm: Number(inputs[`${id}:maintenancePerKm`]), otherPerKm: Number(inputs[`${id}:otherPerKm`]), sourceUrls: [sourceUrl],
      }]));
      const snapshot = { location, observedAt: new Date(`${observedAt}Z`).toISOString(), vehicles, fuelPrices: status?.costs.snapshot?.fuelPrices };
      const costs = await apiRequest<CostDataResponse>("/admin/costs", { method: "PUT", body: JSON.stringify(snapshot) }, token!);
      setStatus((value) => value && ({ ...value, costs })); setMessage("Sourced operating costs published and archived."); onSaved();
    });
  };

  return (
    <section className="inner-page admin-page">
      <div className="page-title"><span className="eyebrow">Data administration</span><h1>Trust starts<br />with the inputs.</h1><p>Manage cost evidence and the estimate model. Official tariff records are kept separate and require a source.</p></div>
      {error && <div className="admin-message error-message" role="alert">{error}</div>}
      {message && <div className="admin-message" role="status">{message}</div>}
      {!token ? (
        <form className="admin-panel admin-login" onSubmit={login}>
          <h2>Administrator sign-in</h2><p>Use a confirmed Supabase account whose email is on the server’s administrator allowlist. Sessions are kept in memory, not local storage.</p>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="primary-button" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button>
        </form>
      ) : (
        <>
          <div className="admin-toolbar"><span>{email}</span><button className="text-button" onClick={() => { setToken(null); setStatus(null); setMessage(""); setError(""); }}>Sign out</button></div>
          <div className="admin-health"><div><small>Daily feed</small><strong>{status?.feedConfigured ? "Provider configured" : "Needs provider configuration"}</strong></div><div><small>Scheduler credential</small><strong>{status?.schedulerSecretConfigured ? "Configured · verify cron separately" : "Not configured"}</strong></div><div><small>Latest observation</small><strong>{status?.costs.snapshot ? new Date(status.costs.snapshot.observedAt).toLocaleString("en-IN") : "No verified data"}</strong></div></div>
          <button className="text-button" disabled={busy || !status?.feedConfigured} onClick={() => void perform(async () => {
            const costs = await apiRequest<CostDataResponse>("/admin/refresh", { method: "POST" }, token);
            setStatus((value) => value && ({ ...value, costs })); setMessage("Provider refreshed successfully."); onSaved();
          })}>{busy ? "Working…" : "Refresh cost provider now"}</button>
          <ResearchPanel token={token} onPublished={async () => { hydrate(await apiRequest<AdminStatus>("/admin/status", {}, token)); onSaved(); }} />
          <CostWorksheet token={token} onPublished={async () => { hydrate(await apiRequest<AdminStatus>("/admin/status", {}, token)); onSaved(); }} />
          <form className="admin-panel" onSubmit={saveCosts}>
            <span className="eyebrow">Verified cost snapshot</span><h2>Publish operating costs</h2><p>Enter sourced rupees per kilometre for each fare unit. Bus costs must be allocated per passenger; other categories are per hired vehicle. Maintenance and other costs should come from documented evidence, not daily guesses.</p>
            <div className="admin-form-grid"><label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Kochi, Kerala" required maxLength={200} /></label><label>Observed at (UTC)<input type="datetime-local" value={observedAt} onChange={(event) => setObservedAt(event.target.value)} required /></label><label>Evidence URL<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" required /></label></div>
            <div className="admin-table-wrap"><table className="admin-input-table"><thead><tr><th>Vehicle</th><th>Fuel ₹/km</th><th>Maintenance ₹/km</th><th>Other ₹/km</th></tr></thead><tbody>{vehicleIds.map((id) => <tr key={id}><td>{labels[id]}</td>{["fuelPerKm", "maintenancePerKm", "otherPerKm"].map((field) => <td key={field}><input aria-label={`${labels[id]} ${field}`} type="number" min="0" max="1000" step="0.001" value={inputs[`${id}:${field}`] ?? ""} onChange={(event) => setInputs((values) => ({ ...values, [`${id}:${field}`]: event.target.value }))} required /></td>)}</tr>)}</tbody></table></div>
            <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Publish sourced costs"}</button>
          </form>
          <form className="admin-panel" onSubmit={saveRates}>
            <span className="eyebrow">Fare model</span><h2>Set the recommendation formula</h2><p>Estimate = base + distance × (distance rate + operating rate). Verified costs replace the fallback operating rate; they do not change official tariffs. Base and distance rates must exclude the operating costs to avoid double-counting.</p>
            <div className="admin-table-wrap"><table className="admin-input-table"><thead><tr><th>Vehicle</th><th>Base ₹</th><th>Distance ₹/km</th><th>Fallback operating ₹/km</th></tr></thead><tbody>{vehicleIds.map((id) => <tr key={id}><td>{labels[id]}</td>{(["base", "distanceRate", "costRate"] as const).map((field) => <td key={field}><input aria-label={`${labels[id]} ${field}`} type="number" min="0" max={field === "base" ? "10000" : "1000"} step="0.001" value={profiles[id][field]} onChange={(event) => setProfiles((values) => ({ ...values, [id]: { ...values[id], [field]: Number(event.target.value) } }))} required /></td>)}</tr>)}</tbody></table></div>
            <label>Official fare records (JSON)<textarea value={official} onChange={(event) => setOfficial(event.target.value)} rows={8} spellCheck={false} /></label>
            <details><summary>Official fare record format</summary><pre>{'{ "vehicleId": "auto", "minimumFare": 0, "includedKm": 0, "perKm": 0, "effectiveFrom": "YYYY-MM-DD", "sourceUrl": "https://official-source" }'}</pre><p>Use an array of records with actual verified values, or [] for none. This supports only minimum-plus-per-km rules, not stage-based bus tariffs or additional surcharges. Do not publish those using an approximate linear rule.</p></details>
            <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save fare model"}</button>
          </form>
        </>
      )}
    </section>
  );
}
