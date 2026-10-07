import { componentKeys, computeOperatingCosts, type CostBasis, type CostComponent } from "./operating-costs.ts";
export const vehicleIds = ["auto", "cab", "maxicab", "contract", "bus"] as const;
export type VehicleId = (typeof vehicleIds)[number];
export type RateProfile = { base: number; distanceRate: number; costRate: number };
export type RateProfiles = Record<VehicleId, RateProfile>;
export const prototypeRates: RateProfiles = {
  auto: { base: 40, distanceRate: 14.4, costRate: 2 },
  cab: { base: 55, distanceRate: 17.5, costRate: 2.8 },
  maxicab: { base: 75, distanceRate: 21, costRate: 3.2 },
  contract: { base: 85, distanceRate: 23, costRate: 3.5 },
  bus: { base: 12, distanceRate: 1.1, costRate: 0.3 },
};
export type CostSnapshot = {
  research?: { reportId: string; baselineObservedAt: string; researchedAt: string };
  observedAt: string;
  location: string;
  vehicles: Partial<Record<VehicleId, {
    observedAt?: string;
    breakdown?: Record<CostComponent, number>;
    basis?: CostBasis;
    fuelPerKm: number;
    maintenancePerKm: number;
    otherPerKm: number;
    sourceUrls: string[];
  }>>;
  fuelPrices?: { name: string; price: number; unit: string; sourceUrl: string; effectiveDate?: string }[];
};
export type CostDataResponse = {
  snapshot: CostSnapshot | null;
  status: "current" | "stale" | "unconfigured" | "unavailable";
  checkedAt?: string;
};
export type OfficialFare = {
  vehicleId: VehicleId;
  minimumFare: number;
  includedKm: number;
  perKm: number;
  effectiveFrom: string;
  sourceUrl: string;
};
export type FareCatalog = {
  profiles: RateProfiles;
  official: OfficialFare[];
  modelStatus: "prototype" | "configured";
  updatedAt: string | null;
};
export type Estimate = {
  vehicleId: VehicleId;
  distance: number;
  base: number;
  distanceRate: number;
  operatingRate: number;
  distanceFare: number;
  operating: number;
  operatingBreakdown?: Record<CostComponent, number>;
  total: number;
  costObservedAt: string | null;
  costStatus: CostDataResponse["status"];
  modelStatus: FareCatalog["modelStatus"];
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
  return value as Record<string, unknown>;
}
function number(value: unknown, field: string, maximum = 10000) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`${field} must be between 0 and ${maximum}`);
  return value;
}
function text(value: unknown, field: string, maximum = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`Invalid ${field}`);
  return value.trim();
}
function httpsUrl(value: unknown) {
  const source = text(value, "source URL", 2000);
  if (new URL(source).protocol !== "https:") throw new Error("Sources must use HTTPS");
  return source;
}
export function validateProfiles(value: unknown): RateProfiles {
  const input = object(value);
  return Object.fromEntries(vehicleIds.map((vehicleId) => {
    const profile = object(input[vehicleId]);
    return [vehicleId, {
      base: number(profile.base, "Base fare"),
      distanceRate: number(profile.distanceRate, "Distance rate", 1000),
      costRate: number(profile.costRate, "Fallback operating rate", 1000),
    }];
  })) as RateProfiles;
}
export function validateSnapshot(value: unknown, now = Date.now()): CostSnapshot {
  const input = object(value);
  const observedAt = text(input.observedAt, "Observation date");
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp) || timestamp > now + 300000 || now - timestamp > 48 * 60 * 60 * 1000) throw new Error("A cost snapshot must be observed within the last 48 hours");
  const rows = object(input.vehicles);
  const available = vehicleIds.filter((vehicleId) => rows[vehicleId] !== undefined);
  if (!available.length || Object.keys(rows).some((key) => !vehicleIds.includes(key as VehicleId))) throw new Error("Provide costs for at least one valid vehicle category");
  const vehicles = Object.fromEntries(available.map((vehicleId) => {
    const row = object(rows[vehicleId]);
    if (!Array.isArray(row.sourceUrls) || !row.sourceUrls.length || row.sourceUrls.length > 10) throw new Error(`Provide source links for ${vehicleId}`);
    const rowObservedAt = row.observedAt === undefined ? observedAt : text(row.observedAt, "Vehicle observation date");
    if (!Number.isFinite(Date.parse(rowObservedAt)) || Date.parse(rowObservedAt) > timestamp) throw new Error("Invalid vehicle observation date");
    const costs: NonNullable<CostSnapshot["vehicles"][VehicleId]> = {
      observedAt: new Date(rowObservedAt).toISOString(),
      fuelPerKm: number(row.fuelPerKm, "Fuel cost", 1000),
      maintenancePerKm: number(row.maintenancePerKm, "Maintenance cost", 1000),
      otherPerKm: number(row.otherPerKm, "Other costs", 1000),
      sourceUrls: row.sourceUrls.map(httpsUrl),
    };
    if (row.breakdown !== undefined) {
      const detailed = object(row.breakdown);
      const breakdown = Object.fromEntries(componentKeys.map((key) => [key, number(detailed[key], key, 1000)])) as Record<CostComponent, number>;
      if (Math.abs(breakdown.fuel - costs.fuelPerKm) > 0.00001 || Math.abs(breakdown.maintenance - costs.maintenancePerKm) > 0.00001 || Math.abs(breakdown.tyres + breakdown.insuranceTax + breakdown.depreciation + breakdown.driverEarnings - costs.otherPerKm) > 0.00001) throw new Error("Six-component breakdown must match the aggregate operating costs");
      costs.breakdown = breakdown;
    }
    if (row.basis !== undefined) {
      const computed = computeOperatingCosts(row.basis, now - Date.parse(rowObservedAt) <= 48 * 60 * 60 * 1000);
      if (!costs.breakdown || componentKeys.some((component) => Math.abs(computed.breakdown[component] - costs.breakdown![component]) > 0.00001)) throw new Error("Published breakdown does not match its documented calculation basis");
      costs.basis = computed.basis;
    }
    return [vehicleId, costs];
  })) as CostSnapshot["vehicles"];
  const snapshot: CostSnapshot = { observedAt: new Date(timestamp).toISOString(), location: text(input.location, "Location"), vehicles };
  if (input.research !== undefined) {
    const research = object(input.research);
    const baselineObservedAt = text(research.baselineObservedAt, "Baseline observation date");
    if (!Number.isFinite(Date.parse(baselineObservedAt))) throw new Error("Invalid baseline observation date");
    const researchedAt = text(research.researchedAt, "Research observation date");
    if (!Number.isFinite(Date.parse(researchedAt))) throw new Error("Invalid research observation date");
    snapshot.research = { reportId: text(research.reportId, "Research report ID"), baselineObservedAt, researchedAt };
  }
  if (input.fuelPrices !== undefined) {
    if (!Array.isArray(input.fuelPrices) || input.fuelPrices.length > 10) throw new Error("Invalid fuel prices");
    snapshot.fuelPrices = input.fuelPrices.map((value) => {
      const row = object(value);
      const price: NonNullable<CostSnapshot["fuelPrices"]>[number] = { name: text(row.name, "Fuel name", 50), price: number(row.price, "Fuel price"), unit: text(row.unit, "Unit", 30), sourceUrl: httpsUrl(row.sourceUrl) };
      if (row.effectiveDate !== undefined) {
        const effectiveDate = text(row.effectiveDate, "Fuel effective date");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !Number.isFinite(Date.parse(effectiveDate)) || new Date(effectiveDate).toISOString().slice(0, 10) !== effectiveDate) throw new Error("Invalid fuel effective date");
        price.effectiveDate = effectiveDate;
      }
      return price;
    });
  }
  return snapshot;
}
export function validateOfficialFares(value: unknown): OfficialFare[] {
  if (!Array.isArray(value) || value.length > 5) throw new Error("Provide at most one official fare per vehicle");
  const seen = new Set<string>();
  return value.map((value) => {
    const row = object(value);
    if (!vehicleIds.includes(row.vehicleId as VehicleId) || seen.has(String(row.vehicleId))) throw new Error("Unknown or duplicate vehicle");
    seen.add(String(row.vehicleId));
    const effectiveFrom = text(row.effectiveFrom, "Effective date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || !Number.isFinite(Date.parse(effectiveFrom)) || new Date(effectiveFrom).toISOString().slice(0, 10) !== effectiveFrom) throw new Error("Use a valid effective date (YYYY-MM-DD)");
    return { vehicleId: row.vehicleId as VehicleId, minimumFare: number(row.minimumFare, "Minimum fare"), includedKm: number(row.includedKm, "Included distance"), perKm: number(row.perKm, "Per-km fare", 1000), effectiveFrom, sourceUrl: httpsUrl(row.sourceUrl) };
  });
}
export function calculateEstimate(vehicleId: VehicleId, distance: number, catalog: FareCatalog, costs: CostDataResponse): Estimate {
  if (!vehicleIds.includes(vehicleId) || !Number.isFinite(distance) || distance <= 0 || distance > 2000) throw new Error("Choose a valid vehicle and a distance between 0 and 2000 km");
  const profile = catalog.profiles[vehicleId];
  const verified = costs.snapshot?.vehicles[vehicleId];
  const operatingRate = verified ? verified.fuelPerKm + verified.maintenancePerKm + verified.otherPerKm : profile.costRate;
  const distanceFare = distance * profile.distanceRate;
  const operating = distance * operatingRate;
  const costObservedAt = verified ? verified.observedAt ?? costs.snapshot!.observedAt : null;
  const fuelDate = verified?.basis?.evidence.fuel.effectiveDate;
  const costStatus = costObservedAt ? (Date.now() - Date.parse(fuelDate ?? costObservedAt) > 48 * 60 * 60 * 1000 ? "stale" : costs.status) : "unconfigured";
  const operatingBreakdown = verified?.breakdown ? Object.fromEntries(componentKeys.map((component) => [component, verified.breakdown![component] * distance])) as Record<CostComponent, number> : undefined;
  return { vehicleId, distance, base: profile.base, distanceRate: profile.distanceRate, operatingRate, distanceFare, operating, operatingBreakdown, total: Math.round(profile.base + distanceFare + operating), costObservedAt, costStatus, modelStatus: catalog.modelStatus };
}
