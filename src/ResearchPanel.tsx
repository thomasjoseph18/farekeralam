import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "./api";
import { vehicleIds } from "../shared/fare-model";
import type { ResearchReport, ResearchSettings, ResearchState } from "../shared/research";
import { componentKeys, componentLabels } from "../shared/operating-costs";

export default function ResearchPanel({ token, onPublished }: { token: string; onPublished: () => Promise<void> }) {
  const [state, setState] = useState<ResearchState | null>(null);
  const [settings, setSettings] = useState<ResearchSettings>({ enabled: false, location: "Thiruvananthapuram, Kerala", profiles: {} });
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<ResearchState>("/admin/research", {}, token).then((value) => { if (active) { setState(value); setSettings(value.settings); } }).catch(() => { if (active) setError("Research endpoints are not available yet. Deploy the updated Supabase function."); });
    return () => { active = false; };
  }, [token]);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Research failed"); }
    finally { setBusy(false); }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const value = await apiRequest<ResearchState>("/admin/research/settings", { method: "PUT", body: JSON.stringify(settings) }, token);
      setState(value); setSettings(value.settings); setMessage("Research settings saved. The daily job collects findings; approval remains required.");
    });
  };
  const review = (action: "approve" | "reject") => void perform(async () => {
    const value = await apiRequest<ResearchState>("/admin/research/review", { method: "POST", body: JSON.stringify({ reportId: state?.report?.id, action, confirmEvidence: confirmed }) }, token);
    setState(value); setConfirmed(false);
    if (action === "approve") { await onPublished(); setMessage("Reviewed fuel costs published. Fares now use the new fuel component; maintenance and other baseline costs are unchanged."); }
    else setMessage("Report rejected. Published costs were not changed.");
  });
  const updateProfile = (id: (typeof vehicleIds)[number], field: string, value: string | number) => setSettings((current) => ({ ...current, profiles: { ...current.profiles, [id]: { fuel: "Petrol", kmPerLitre: 0, fareUnits: 1, sourceUrl: "", ...current.profiles[id], [field]: value } } }));
  const report = state?.report;
  return <section className="admin-panel research-panel">
    <span className="eyebrow">Gemini + Google Search</span><h2>Evidence before an estimate.</h2>
    <p>Research local fuel prices and maintenance evidence without a commercial price feed. Gemini is a researcher, not a source of truth. Findings remain pending until you review the dated source. API quotas and charges depend on your Google project.</p>
    <div className="research-badges"><span>{state?.configured ? "Gemini key configured" : "Gemini setup pending"}</span><span>One research attempt per 24 hours</span><span>No automatic maintenance guesses</span></div>
    {error && <div className="admin-message error-message" role="alert">{error}</div>}{message && <div className="admin-message" role="status">{message}</div>}
    <form onSubmit={save}>
      <div className="admin-form-grid"><label>Exact research location<input value={settings.location} onChange={(event) => setSettings((current) => ({ ...current, location: event.target.value }))} required maxLength={150} /></label></div>
      <label className="research-consent"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} />Enable daily Gemini research through the configured scheduler. Usage may incur Google API charges.</label>
      <p>For fuel conversion, enter documented efficiency—not a typical number guessed by AI. Fuel ₹/km = price ₹/litre ÷ km/litre ÷ fare units. Hired vehicles use 1 unit; a bus uses the documented passenger allocation.</p>
      <div className="admin-table-wrap"><table className="admin-input-table"><thead><tr><th>Category</th><th>Fuel</th><th>km/litre</th><th>Fare units</th><th>Efficiency evidence</th></tr></thead><tbody>{vehicleIds.map((id) => <tr key={id}><td>{id}</td><td><select aria-label={`${id} fuel`} value={settings.profiles[id]?.fuel ?? "Petrol"} onChange={(event) => updateProfile(id, "fuel", event.target.value)}><option>Petrol</option><option>Diesel</option></select></td><td><input type="number" aria-label={`${id} km per litre`} min="0.1" max="100" step="0.1" value={settings.profiles[id]?.kmPerLitre || ""} onChange={(event) => updateProfile(id, "kmPerLitre", Number(event.target.value))} /></td><td><input type="number" aria-label={`${id} fare units`} min="1" max={id === "bus" ? "100" : "1"} value={settings.profiles[id]?.fareUnits ?? 1} onChange={(event) => updateProfile(id, "fareUnits", Number(event.target.value))} /></td><td><input type="url" aria-label={`${id} efficiency evidence`} placeholder="https://…" value={settings.profiles[id]?.sourceUrl ?? ""} onChange={(event) => updateProfile(id, "sourceUrl", event.target.value)} /></td></tr>)}</tbody></table></div>
      <button className="primary-button" disabled={busy || !state}>Save research settings</button>
    </form>
    <div className="research-actions"><button className="text-button" disabled={busy || !state?.configured} onClick={() => void perform(async () => {
      const report = await apiRequest<ResearchReport>("/admin/research/run", { method: "POST" }, token, 65000);
      setState((current) => current && ({ ...current, report })); setConfirmed(false); setMessage("Grounded findings collected. Review the sources before publishing.");
    })}>{busy ? "Working…" : "Research published costs now ↗"}</button><small>Save location changes before researching.</small></div>
    {report && <div className="research-report">
      <div className="research-report-heading"><h3>{report.location}</h3><span>{report.status} · {new Date(report.researchedAt).toLocaleString("en-IN")}</span></div>
      {report.fuelPrices.length ? <div className="research-findings">{report.fuelPrices.map((price) => <article key={price.name}><span>{price.name} · {price.effectiveDate}</span><strong>₹{price.price.toFixed(2)}<small>/litre</small></strong><p>{price.evidence}</p><a className="source-link" href={price.sourceUrl} target="_blank" rel="noreferrer">Inspect cited source ↗</a></article>)}</div> : <p>No current, dated fuel prices were found. Published costs remain unchanged.</p>}
      <div className="six-cost-evidence">{componentKeys.map((component) => {
        const findings = report.costFindings?.filter((finding) => finding.component === component) ?? [];
        return <section className="maintenance-finding" key={component}><h4>{componentLabels[component]}</h4>{findings.length ? findings.map((finding, index) => <article key={index}><strong>{finding.amount === null ? "No applicable numeric amount" : `${finding.amount.toLocaleString("en-IN")} ${finding.unit}`}</strong><small>{finding.vehicleId ?? "General benchmark"} · {finding.effectiveDate ?? "No published date"}</small><p>{finding.evidence}</p><p>{finding.context}</p><a className="source-link" href={finding.sourceUrl} target="_blank" rel="noreferrer">Inspect evidence ↗</a></article>) : <p>No applicable evidence collected yet. Do not substitute an AI guess.</p>}</section>;
      })}</div>
      {!report.costFindings?.length && report.maintenanceFindings.map((finding, index) => <article className="maintenance-finding" key={index}><h4>{finding.topic}</h4><p>{finding.summary}</p><a className="source-link" href={finding.sourceUrl} target="_blank" rel="noreferrer">Inspect evidence ↗</a><small>Research only · not applied to fares</small></article>)}
      {report.missing.length > 0 && <div className="research-missing"><strong>Evidence gaps</strong><ul>{report.missing.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      {report.searchSuggestions && <iframe className="search-suggestions" title="Google Search grounding suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={report.searchSuggestions} referrerPolicy="no-referrer" />}
      {report.status === "pending" && <><label className="research-consent"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I inspected the cited source, location, date and price, and confirmed the efficiency inputs. Only fuel will be changed.</label><div className="research-actions"><button className="primary-button" disabled={busy || !confirmed || !report.fuelPrices.length} onClick={() => review("approve")}>Approve fuel update</button><button className="text-button" disabled={busy} onClick={() => review("reject")}>Reject findings</button></div></>}
    </div>}
  </section>;
}
