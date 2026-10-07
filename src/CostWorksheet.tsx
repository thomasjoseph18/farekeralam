import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "./api";
import { vehicleIds, type VehicleId } from "../shared/fare-model";
import { basisFields, componentKeys, componentLabels, componentFormulas, type CostBasis, type CostComponent } from "../shared/operating-costs";

type SavedBases = Partial<Record<VehicleId, { basis: CostBasis; reviewedAt: string }>>;
type Computed = { breakdown: Record<CostComponent, number>; totalPerKm: number };
export default function CostWorksheet({ token, onPublished }: { token: string; onPublished: () => Promise<void> }) {
  const [saved, setSaved] = useState<SavedBases>({});
  const [vehicleId, setVehicleId] = useState<VehicleId>("auto");
  const [values, setValues] = useState<Record<string, string>>({ fareUnits: "1" });
  const [computed, setComputed] = useState<Computed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<SavedBases>("/admin/cost-bases", {}, token).then((data) => { if (active) { setSaved(data); if (data.auto) loadBasis(data.auto.basis); } }).catch(() => { if (active) setError("Deploy the updated backend to save six-component worksheets."); });
    return () => { active = false; };
  }, [token]);
  const loadBasis = (basis: CostBasis) => setValues({ ...Object.fromEntries(Object.entries(basis).filter(([key]) => key !== "evidence").map(([key, value]) => [key, String(value)])), ...Object.fromEntries(componentKeys.flatMap((component) => Object.entries(basis.evidence[component]).map(([field, value]) => [`${component}:${field}`, value]))) });
  const field = (name: string, value: string) => { setValues((current) => ({ ...current, [name]: value })); setComputed(null); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const numeric = Object.fromEntries(Object.values(basisFields).flat().map(([key]) => [key, Number(values[key])]));
      const basis = { ...numeric, location: values.location, efficiencySourceUrl: values.efficiencySourceUrl, fareUnits: Number(values.fareUnits), evidence: Object.fromEntries(componentKeys.map((component) => [component, { sourceUrl: values[`${component}:sourceUrl`], effectiveDate: values[`${component}:effectiveDate`], note: values[`${component}:note`] }])) };
      const response = await apiRequest<{ published: boolean; computed: Computed & { basis: CostBasis }; remaining: VehicleId[] }>("/admin/cost-bases", { method: "POST", body: JSON.stringify({ vehicleId, basis }) }, token);
      setComputed(response.computed); setSaved((current) => ({ ...current, [vehicleId]: { basis: response.computed.basis, reviewedAt: new Date().toISOString() } }));
      setMessage(response.published ? `${vehicleId} costs published. Fare estimates now use all six calculated components. Other published vehicles remain unchanged; categories without evidence use labelled fallback rates.` : "Worksheet saved but not published. Existing fares remain unchanged.");
      if (response.published) await onPublished();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Calculation failed"); }
    finally { setBusy(false); }
  };
  return <section className="admin-panel cost-worksheet"><span className="eyebrow">Six-component cost engine</span><h2>From evidence to ₹/km.</h2><p>Review the Gemini findings above, then enter applicable documented amounts and mileage. Every category needs dated evidence and an allocation note. Driver earnings are a reviewed target, not an AI prediction. Service costs must exclude tyres and other separately counted items.</p>
    {error && <div className="admin-message error-message" role="alert">{error}</div>}{message && <div className="admin-message" role="status">{message}</div>}
    <div className="worksheet-vehicles">{vehicleIds.map((id) => <button className={vehicleId === id ? "selected" : ""} key={id} onClick={() => { setVehicleId(id); setComputed(null); setMessage(""); setError(""); if (saved[id]) loadBasis(saved[id]!.basis); else setValues({ location: values.location ?? "", fareUnits: "1" }); }}>{id}<small>{saved[id] ? "Worksheet saved" : "Needs evidence"}</small></button>)}</div>
    <form onSubmit={submit}><div className="admin-form-grid"><label>Exact location<input value={values.location ?? ""} onChange={(event) => field("location", event.target.value)} required /></label><label>Fare units (bus passenger allocation)<input type="number" min="1" max={vehicleId === "bus" ? "100" : "1"} step="1" value={values.fareUnits ?? "1"} onChange={(event) => field("fareUnits", event.target.value)} required /></label></div>
      <div className="worksheet-components">{componentKeys.map((component, index) => <section className="worksheet-component" key={component}><div className="worksheet-heading"><span>0{index + 1}</span><h3>{componentLabels[component]}</h3></div><p>{componentFormulas[component]} · then divide by fare units</p><div className="admin-form-grid">{basisFields[component].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" max="100000000" step="0.01" value={values[key] ?? ""} onChange={(event) => field(key, event.target.value)} required /></label>)}</div>{component === "fuel" && <label>Fuel-efficiency evidence URL<input type="url" value={values.efficiencySourceUrl ?? ""} onChange={(event) => field("efficiencySourceUrl", event.target.value)} required /></label>}<div className="admin-form-grid"><label>Amount evidence URL<input type="url" value={values[`${component}:sourceUrl`] ?? ""} onChange={(event) => field(`${component}:sourceUrl`, event.target.value)} required /></label><label>Source effective date<input type="date" value={values[`${component}:effectiveDate`] ?? ""} onChange={(event) => field(`${component}:effectiveDate`, event.target.value)} required /></label></div><label>Evidence and allocation note<textarea rows={2} placeholder="Vehicle/model, units, mileage evidence, coverage and assumptions" value={values[`${component}:note`] ?? ""} onChange={(event) => field(`${component}:note`, event.target.value)} required /></label></section>)}</div>
      <button className="primary-button" disabled={busy}>{busy ? "Calculating…" : "Calculate and save reviewed worksheet"}</button>
    </form>
    {computed && <div className="worksheet-results">{componentKeys.map((component) => <div key={component}><span>{componentLabels[component]}</span><strong>₹{computed.breakdown[component].toFixed(3)}/km</strong></div>)}<div className="worksheet-total"><span>Total operating cost</span><strong>₹{computed.totalPerKm.toFixed(3)}/km</strong></div></div>}
  </section>;
}
