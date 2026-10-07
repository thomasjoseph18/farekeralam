export const componentKeys = ["fuel", "maintenance", "tyres", "insuranceTax", "depreciation", "driverEarnings"] as const;
export type CostComponent = (typeof componentKeys)[number];
export const componentLabels: Record<CostComponent, string> = { fuel: "Fuel", maintenance: "Maintenance", tyres: "Tyres", insuranceTax: "Insurance & tax", depreciation: "Depreciation", driverEarnings: "Driver earnings" };
export type CostBasis = {
  location: string;
  fuelPrice: number;
  kmPerLitre: number;
  efficiencySourceUrl: string;
  serviceCost: number;
  serviceIntervalKm: number;
  tyreSetCost: number;
  tyreLifeKm: number;
  annualInsurance: number;
  annualTax: number;
  annualKm: number;
  purchasePrice: number;
  residualValue: number;
  usefulLifeKm: number;
  monthlyDriverEarnings: number;
  monthlyKm: number;
  fareUnits: number;
  evidence: Record<CostComponent, { sourceUrl: string; effectiveDate: string; note: string }>;
};
export const basisFields = {
  fuel: [["fuelPrice", "Fuel price · ₹/litre"], ["kmPerLitre", "Documented efficiency · km/litre"]],
  maintenance: [["serviceCost", "Service cost · ₹"], ["serviceIntervalKm", "Service interval · km"]],
  tyres: [["tyreSetCost", "Complete tyre-set cost · ₹"], ["tyreLifeKm", "Replacement interval · km"]],
  insuranceTax: [["annualInsurance", "Annual insurance · ₹"], ["annualTax", "Annual tax · ₹"], ["annualKm", "Annual vehicle distance · km"]],
  depreciation: [["purchasePrice", "Purchase price · ₹"], ["residualValue", "Documented residual value · ₹"], ["usefulLifeKm", "Useful life · km"]],
  driverEarnings: [["monthlyDriverEarnings", "Monthly driver earnings target · ₹"], ["monthlyKm", "Monthly vehicle distance · km"]],
} as const;
export const componentFormulas = {
  fuel: "Fuel price ÷ fuel efficiency",
  maintenance: "Service cost ÷ service interval km",
  tyres: "Tyre-set cost ÷ replacement interval km",
  insuranceTax: "(Annual insurance + annual tax) ÷ annual km",
  depreciation: "(Purchase price − residual value) ÷ useful-life km",
  driverEarnings: "Monthly earnings target ÷ monthly km",
};
export function computeOperatingCosts(value: unknown, requireFreshFuel = true) {
  const basis = value as CostBasis;
  if (!basis || typeof basis.location !== "string" || !basis.location.trim() || basis.location.length > 150) throw new Error("Provide an exact location");
  const positive = ["fuelPrice", "kmPerLitre", "serviceIntervalKm", "tyreLifeKm", "annualKm", "usefulLifeKm", "monthlyKm", "fareUnits"];
  for (const field of [...positive, "serviceCost", "tyreSetCost", "annualInsurance", "annualTax", "purchasePrice", "residualValue", "monthlyDriverEarnings"]) {
    const amount = basis[field as keyof CostBasis];
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 100000000 || (positive.includes(field) && amount === 0)) throw new Error(`Provide a valid ${field}; mileage divisors must be greater than zero`);
  }
  if (!Number.isInteger(basis.fareUnits) || basis.fareUnits > 100 || basis.kmPerLitre > 100) throw new Error("Invalid fare-unit allocation or fuel efficiency");
  if (basis.residualValue > basis.purchasePrice) throw new Error("Residual value cannot exceed purchase price");
  if (typeof basis.efficiencySourceUrl !== "string" || basis.efficiencySourceUrl.length > 2000 || new URL(basis.efficiencySourceUrl).protocol !== "https:") throw new Error("Provide a documented fuel-efficiency source URL");
  const evidence = Object.fromEntries(componentKeys.map((component) => {
    const entry = basis.evidence?.[component];
    if (!entry || typeof entry.sourceUrl !== "string" || entry.sourceUrl.length > 2000 || new URL(entry.sourceUrl).protocol !== "https:" || typeof entry.effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.effectiveDate) || !Number.isFinite(Date.parse(entry.effectiveDate)) || new Date(entry.effectiveDate).toISOString().slice(0, 10) !== entry.effectiveDate || Date.parse(entry.effectiveDate) > Date.now() || typeof entry.note !== "string" || !entry.note.trim() || entry.note.length > 2000) throw new Error(`Document ${componentLabels[component]} with a source, effective date and allocation note`);
    return [component, { sourceUrl: entry.sourceUrl, effectiveDate: entry.effectiveDate, note: entry.note.trim() }];
  })) as CostBasis["evidence"];
  if (requireFreshFuel && Date.now() - Date.parse(evidence.fuel.effectiveDate) > 48 * 60 * 60 * 1000) throw new Error("Fuel evidence must be dated within the last 48 hours");
  const normalized: CostBasis = { location: basis.location.trim(), evidence, efficiencySourceUrl: basis.efficiencySourceUrl } as CostBasis;
  for (const field of [...positive, "serviceCost", "tyreSetCost", "annualInsurance", "annualTax", "purchasePrice", "residualValue", "monthlyDriverEarnings"]) Object.assign(normalized, { [field]: basis[field as keyof CostBasis] });
  const breakdown: Record<CostComponent, number> = {
    fuel: basis.fuelPrice / basis.kmPerLitre / basis.fareUnits,
    maintenance: basis.serviceCost / basis.serviceIntervalKm / basis.fareUnits,
    tyres: basis.tyreSetCost / basis.tyreLifeKm / basis.fareUnits,
    insuranceTax: (basis.annualInsurance + basis.annualTax) / basis.annualKm / basis.fareUnits,
    depreciation: (basis.purchasePrice - basis.residualValue) / basis.usefulLifeKm / basis.fareUnits,
    driverEarnings: basis.monthlyDriverEarnings / basis.monthlyKm / basis.fareUnits,
  };
  const otherPerKm = breakdown.tyres + breakdown.insuranceTax + breakdown.depreciation + breakdown.driverEarnings;
  if (Object.values(breakdown).some((amount) => amount > 1000) || otherPerKm > 1000) throw new Error("Computed costs exceed the supported per-kilometre range; check units");
  return { basis: normalized, breakdown, fuelPerKm: breakdown.fuel, maintenancePerKm: breakdown.maintenance, otherPerKm, sourceUrls: [...new Set([...Object.values(evidence).map((entry) => entry.sourceUrl), basis.efficiencySourceUrl])], totalPerKm: breakdown.fuel + breakdown.maintenance + otherPerKm };
}
