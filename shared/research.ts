import type { VehicleId } from "./fare-model.ts";
import type { CostComponent } from "./operating-costs.ts";
export type ResearchSettings = {
  enabled: boolean;
  location: string;
  profiles: Partial<Record<VehicleId, { fuel: "Petrol" | "Diesel"; kmPerLitre: number; fareUnits: number; sourceUrl: string }>>;
};
export type ResearchReport = {
  id: string;
  researchedAt: string;
  location: string;
  status: "pending" | "approved" | "rejected";
  fuelPrices: { name: "Petrol" | "Diesel"; price: number; effectiveDate: string; sourceUrl: string; evidence: string }[];
  maintenanceFindings: { topic: string; summary: string; sourceUrl: string }[];
  costFindings?: { component: CostComponent; vehicleId: VehicleId | null; amount: number | null; unit: string; effectiveDate: string | null; evidence: string; sourceUrl: string; context: string }[];
  sources: { uri: string; title: string }[];
  searchSuggestions: string;
  missing: string[];
};
export type ResearchState = { configured: boolean; settings: ResearchSettings; report: ResearchReport | null };

export function validateResearchSettings(value: unknown): ResearchSettings {
  const input = value as ResearchSettings;
  if (!input || typeof input.enabled !== "boolean" || typeof input.location !== "string" || !input.location.trim() || input.location.length > 150 || !input.profiles || typeof input.profiles !== "object") throw new Error("Provide a location and valid research settings");
  const profiles: ResearchSettings["profiles"] = {};
  for (const id of ["auto", "cab", "maxicab", "contract", "bus"] as VehicleId[]) {
    const profile = input.profiles[id];
    if (!profile) continue;
    if (!["Petrol", "Diesel"].includes(profile.fuel) || !Number.isFinite(profile.kmPerLitre) || profile.kmPerLitre <= 0 || profile.kmPerLitre > 100 || !Number.isInteger(profile.fareUnits) || profile.fareUnits < 1 || profile.fareUnits > 100 || typeof profile.sourceUrl !== "string" || profile.sourceUrl.length > 2000 || new URL(profile.sourceUrl).protocol !== "https:") throw new Error(`Invalid documented fuel efficiency for ${id}`);
    if (id !== "bus" && profile.fareUnits !== 1) throw new Error("Hired vehicles use one fare unit; only bus costs can be allocated per passenger");
    profiles[id] = { fuel: profile.fuel, kmPerLitre: profile.kmPerLitre, fareUnits: profile.fareUnits, sourceUrl: profile.sourceUrl };
  }
  return { enabled: input.enabled, location: input.location.trim(), profiles };
}
