import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider, useNavigate, useParams, useSearchParams } from "react-router";
import { apiRequest } from "./api";
import Admin from "./Admin";
import { componentKeys, componentLabels } from "../shared/operating-costs";
import { calculateEstimate, prototypeRates, type CostSnapshot, type Estimate, type FareCatalog, type VehicleId } from "../shared/fare-model";
import type { CostDataResponse } from "./cost-data";

type Page = "home" | "vehicles" | "calculate" | "result" | "fares" | "costs" | "about" | "admin";
type IconName =
  | "arrow"
  | "auto"
  | "bus"
  | "cab"
  | "chart"
  | "check"
  | "chevron"
  | "close"
  | "document"
  | "drop"
  | "external"
  | "fuel"
  | "info"
  | "menu"
  | "route"
  | "shield"
  | "spark"
  | "tools"
  | "tyre"
  | "van";

const paths: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  auto: (
    <>
      <path d="M4 17h15l1-5-3-4H8L5 12l-1 5Z" />
      <path d="M8 8 6.5 4h8L17 8M8 12h9M12 8v4" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  bus: (
    <>
      <rect x="5" y="3" width="14" height="17" rx="3" />
      <path d="M8 7h8v6H8zM8 17h.01M16 17h.01M5 14h14" />
      <path d="M7 20v1M17 20v1" />
    </>
  ),
  cab: (
    <>
      <path d="m5 11 2-5h10l2 5 1 2v5H4v-5l1-2Z" />
      <path d="M7 11h10M8 6l1-2h6l1 2" />
      <circle cx="7" cy="16" r="1.5" />
      <circle cx="17" cy="16" r="1.5" />
    </>
  ),
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  document: (
    <>
      <path d="M7 3h7l4 4v14H7zM14 3v5h4" />
      <path d="M10 13h5M10 17h5" />
    </>
  ),
  drop: <path d="M12 3s6 6.2 6 11a6 6 0 1 1-12 0c0-4.8 6-11 6-11Z" />,
  external: (
    <>
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" />
    </>
  ),
  fuel: (
    <>
      <path d="M6 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h14" />
      <path d="M8 6h6v5H8zM16 8h2l2 3v6a2 2 0 0 1-4 0" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  route: (
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3" />
    </>
  ),
  shield: <path d="M12 3 5 6v5c0 4.8 2.9 8.2 7 10 4.1-1.8 7-5.2 7-10V6l-7-3Zm-3 9 2 2 4-5" />,
  spark: <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />,
  tools: (
    <>
      <path d="m14 7 3-3 3 3-3 3M16 8 8 16" />
      <path d="m10 17-3 3-3-3 3-3M8 16l8-8" />
    </>
  ),
  tyre: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="m9 4 1 4M15 4l-1 4M20 9l-4 1M20 15l-4-1M9 20l1-4M15 20l-1-4M4 9l4 1M4 15l4-1" />
    </>
  ),
  van: (
    <>
      <path d="M3 7h12l5 5v6H3z" />
      <path d="M15 7v5h5M6 10h5" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      {paths[name]}
    </svg>
  );
}

const vehicles = [
  {
    id: "auto" as const,
    name: "Auto Rickshaw",
    short: "Auto",
    description: "Short-distance passenger transport",
    detail: "Up to 3 passengers",
    icon: "auto" as IconName,
    requiresSeats: false,
  },
  {
    id: "cab" as const,
    name: "Motor Cab",
    short: "Taxi",
    description: "Point-to-point passenger journeys",
    detail: "Up to 6 passengers",
    icon: "cab" as IconName,
    requiresSeats: false,
  },
  {
    id: "maxicab" as const,
    name: "Maxicab",
    short: "Maxicab",
    description: "Higher-capacity passenger vehicle",
    detail: "7–12 passengers",
    icon: "van" as IconName,
    requiresSeats: true,
  },
  {
    id: "contract" as const,
    name: "Contract Carriage",
    short: "Contract vehicle",
    description: "Tourist and contracted passenger travel",
    detail: "Seating capacity required",
    icon: "van" as IconName,
    requiresSeats: true,
  },
  {
    id: "bus" as const,
    name: "Stage Carriage",
    short: "Bus",
    description: "Public route transportation",
    detail: "Government-classified service",
    icon: "bus" as IconName,
    requiresSeats: false,
  },
];

const governmentClasses = [
  {
    name: "Hire / Contract Carriage",
    items: [
      { name: "Auto Rickshaw", note: "Mapped to Auto Rickshaw" },
      { name: "Quadricycle", note: "Classification available · no fare category mapped" },
      { name: "Motor Cab / Taxi", note: "Mapped to Motor Cab" },
      { name: "Maxicab", note: "Mapped to Maxicab" },
      { name: "Contract Carriage", note: "Traveller / Contract vehicles" },
    ],
  },
  {
    name: "Stage Carriage",
    items: [
      { name: "Ordinary / Mofussil", note: "Stage Carriage service" },
      { name: "City Fast", note: "Stage Carriage service" },
      { name: "Fast Passenger / Limited Stop", note: "Stage Carriage service" },
      { name: "Super Fast", note: "Stage Carriage service" },
      { name: "Express", note: "Stage Carriage service" },
      { name: "Super Express", note: "Stage Carriage service" },
      { name: "Super Air Express", note: "Stage Carriage service" },
      { name: "Super Deluxe / Semi Sleeper", note: "Stage Carriage service" },
      { name: "Luxury / High-Tech / AC", note: "Four configurations available" },
    ],
  },
];

const stageCarriageServices = governmentClasses[1].items.map((item) => item.name);
const luxuryConfigurations = ["Single Axle", "Multi Axle", "Low Floor AC", "Low Floor Non-AC"];

const costFactors = [
  { icon: "fuel" as IconName, label: "Fuel", value: "32%", className: "fuel" },
  { icon: "tools" as IconName, label: "Maintenance", value: "14%", className: "maintenance" },
  { icon: "tyre" as IconName, label: "Tyres", value: "8%", className: "tyres" },
  { icon: "document" as IconName, label: "Insurance & tax", value: "6%", className: "insurance" },
  { icon: "chart" as IconName, label: "Depreciation", value: "15%", className: "depreciation" },
  { icon: "shield" as IconName, label: "Driver earnings", value: "25%", className: "earnings" },
];

function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="brand-text">
        <strong>FARE</strong>
        <small>KERALA<span>M</span></small>
      </span>
    </span>
  );
}

function HeroIllustration() {
  return (
    <svg className="hero-illustration" viewBox="0 0 620 500" role="img" aria-label="Illustrated Kerala transport atlas featuring Kozhikode, Kochi and Thiruvananthapuram, with an auto rickshaw, taxi and bus">
      <g className="atlas-contours" fill="none">
        <path d="M22 145C91 51 156 170 248 96S433 38 593 103M12 169C96 75 167 197 261 122S455 66 610 131M5 198C108 105 181 224 280 150S470 99 619 163M-8 231C119 133 193 254 295 179S490 129 629 197" />
        <path d="M32 467C171 405 280 471 395 435S544 436 612 468M20 488C166 431 284 494 405 460S558 462 630 491" />
      </g>
      <g className="atlas-route" fill="none">
        <path d="M101 108h81l60 57h99l50-53h127" />
        <path d="M122 216h70l59-51M341 165l43 51v45" />
        <circle cx="101" cy="108" r="6" /><circle cx="242" cy="165" r="6" /><circle cx="518" cy="112" r="6" />
      </g>
      <g className="atlas-labels">
        <text x="79" y="88">KOZHIKODE</text><text x="218" y="145">KOCHI</text><text x="392" y="91">THIRUVANANTHAPURAM</text>
        <text x="63" y="246" className="atlas-title">A state in motion.</text>
        <text x="63" y="267" className="atlas-subtitle">EVERY ROUTE. EVERY RIDER.</text>
        <text x="63" y="445">01 / AUTO</text><text x="235" y="445">02 / TAXI</text><text x="407" y="445">03 / BUS</text>
      </g>
      <path
        className="kerala-shape"
        d="M397 31c-11 36-7 66-27 96-17 25-16 50-11 82 5 29-10 63-8 96 3 45 35 82 44 126 4 20 3 36 0 54 23-13 39-35 41-62 3-40-18-75-15-114 2-31 21-52 17-86-4-30-25-50-24-79 1-42 27-69 12-113-7-20-23-22-29 0Z"
      />
      <path className="road-line" d="M82 392c105-23 209-28 421-8" />
      <g className="illustration-bus">
        <path d="M349 209h129c18 0 31 14 31 31v135H331V227c0-10 8-18 18-18Z" />
        <path d="M355 233h129v69H355z" />
        <path d="M417 233v69M355 319h129" />
        <circle cx="365" cy="376" r="22" />
        <circle cx="474" cy="376" r="22" />
      </g>
      <g className="illustration-cab">
        <path d="M220 287h90l29 32 9 58H190l6-55 24-35Z" />
        <path d="m227 298-17 25h105l-19-25h-69Z" />
        <circle cx="222" cy="378" r="19" />
        <circle cx="317" cy="378" r="19" />
      </g>
      <g className="illustration-auto">
        <path d="M75 302h78l28 47v30H54l6-45 15-32Z" />
        <path d="M78 302 66 277h62l25 25M96 302v47M60 335h120" />
        <circle cx="82" cy="380" r="18" />
        <circle cx="159" cy="380" r="18" />
      </g>
      <g className="illustration-ground">
        <path d="M42 408h475" />
        <path d="m528 395 12 13-12 13M551 395l12 13-12 13" />
      </g>
    </svg>
  );
}

function DataNotice({ children }: { children: ReactNode }) {
  return (
    <div className="data-notice">
      <Icon name="info" size={17} />
      <span>{children}</span>
    </div>
  );
}

function FareApp() {
  const routerNavigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { page: routePage } = useParams();
  const pages: Page[] = ["home", "vehicles", "calculate", "result", "fares", "costs", "about", "admin"];
  const page = (routePage ?? "home") as Page;
  const validPage = pages.includes(page);
  const [reload, setReload] = useState(0);
  const [catalog, setCatalog] = useState<FareCatalog>({ profiles: prototypeRates, official: [], modelStatus: "prototype", updatedAt: null });
  const [serviceConnected, setServiceConnected] = useState(false);
  const [history, setHistory] = useState<CostSnapshot[]>([]);
  const [backendEstimate, setBackendEstimate] = useState<Estimate | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calculationNotice, setCalculationNotice] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [systemFilter, setSystemFilter] = useState("all");
  const [costData, setCostData] = useState<CostDataResponse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const loadCosts = async () => {
      try {
        const data = await apiRequest<CostDataResponse>("/costs", { signal: controller.signal });
        setCostData(data);
        setBackendEstimate(null);
      } catch {
        if (!controller.signal.aborted) setCostData((previous) => ({ snapshot: previous?.snapshot ?? null, status: previous?.snapshot ? "stale" : "unavailable" }));
      }
    };
    const loadCatalog = async () => {
      try {
        const values = await apiRequest<FareCatalog>("/fares", { signal: controller.signal });
        setCatalog(values); setServiceConnected(true);
        const snapshots = await apiRequest<CostSnapshot[]>("/costs/history", { signal: controller.signal });
        setHistory(snapshots);
      } catch { if (!controller.signal.aborted) setServiceConnected(false); }
    };
    void loadCosts();
    void loadCatalog();
    const interval = window.setInterval(() => { void loadCosts(); void loadCatalog(); }, 60 * 60 * 1000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [reload]);
  const [selectedId, setSelectedId] = useState<VehicleId>(() => vehicles.find((vehicle) => vehicle.id === searchParams.get("vehicle"))?.id ?? "auto");
  const [distance, setDistance] = useState(() => searchParams.get("distance") ?? "12.5");
  useEffect(() => {
    if (routePage !== "result") return;
    const vehicle = vehicles.find((value) => value.id === searchParams.get("vehicle"));
    const requestedDistance = Number(searchParams.get("distance"));
    if (vehicle) setSelectedId(vehicle.id);
    if (requestedDistance > 0 && requestedDistance <= 2000) setDistance(String(requestedDistance));
  }, [routePage, searchParams]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [seatingCapacity, setSeatingCapacity] = useState("12");
  const [stageService, setStageService] = useState(stageCarriageServices[0]);
  const [stageConfiguration, setStageConfiguration] = useState(luxuryConfigurations[0]);

  const selected = vehicles.find((vehicle) => vehicle.id === selectedId) ?? vehicles[0];
  const selectedBreakdown = costData?.snapshot?.vehicles[selected.id]?.breakdown;
  const componentTotal = selectedBreakdown ? Object.values(selectedBreakdown).reduce((total, value) => total + value, 0) : 0;
  const displayedFactors = costFactors.map((factor, index) => ({ ...factor, value: selectedBreakdown ? `${componentTotal > 0 ? (selectedBreakdown[componentKeys[index]] / componentTotal * 100).toFixed(1) : "0.0"}%` : factor.value }));
  const donutColors = ["#89b99a", "#d5a956", "#668774", "#56615b", "#486e58", "#2b5c42"];
  let cumulativeShare = 0;
  const donutGradient = selectedBreakdown && componentTotal > 0 ? `conic-gradient(${componentKeys.map((component, index) => { const start = cumulativeShare; cumulativeShare += selectedBreakdown[component] / componentTotal * 100; return `${donutColors[index]} ${start}% ${cumulativeShare}%`; }).join(",")})` : undefined;
  const distanceNumber = Math.max(0, Number.parseFloat(distance) || 0);
  const calculation = useMemo(() => {
    if (backendEstimate?.vehicleId === selected.id && backendEstimate.distance === distanceNumber) return backendEstimate;
    return calculateEstimate(selected.id, distanceNumber > 0 && distanceNumber <= 2000 ? distanceNumber : 1, catalog, costData ?? { snapshot: null, status: "unavailable" });
  }, [distanceNumber, selected, catalog, costData, backendEstimate]);

  const navigate = (next: Page) => {
    routerNavigate(next === "home" ? "/" : next === "result" ? `/result?vehicle=${selectedId}&distance=${distanceNumber}` : `/${next}`);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const calculate = async () => {
    if (calculating) return;
    if (distanceNumber <= 0 || distanceNumber > 2000) { setCalculationNotice("Enter a distance greater than 0 and no more than 2000 km."); return; }
    setCalculating(true); setCalculationNotice("");
    try {
      const estimate = await apiRequest<Estimate>("/estimates", { method: "POST", body: JSON.stringify({ vehicleId: selected.id, distance: distanceNumber }) });
      setBackendEstimate(estimate);
    } catch {
      setBackendEstimate(null);
      setCalculationNotice("Backend calculation unavailable. This is a local preview using the last loaded model, not a live server quote.");
    } finally { setCalculating(false); navigate("result"); }
  };

  const navItems: Array<{ label: string; page: Page }> = [
    { label: "Home", page: "home" },
    { label: "Calculate", page: "calculate" },
    { label: "Fares", page: "fares" },
    { label: "Cost data", page: "costs" },
    { label: "About", page: "about" },
  ];
  const filteredVehicles = vehicles.filter((vehicle) => vehicleFilter === "all" || vehicle.id === vehicleFilter);
  const officialRule = catalog.official.find((record) => record.vehicleId === selectedId && record.effectiveFrom <= new Date().toISOString().slice(0, 10));
  const officialTotal = officialRule ? Math.round(officialRule.minimumFare + Math.max(0, distanceNumber - officialRule.includedKm) * officialRule.perKm) : null;

  return (
    <div className="app">
      <header className="site-header">
        <button className="brand-button" onClick={() => navigate("home")} aria-label="Fare Keralam home">
          <Brand />
        </button>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              className={page === item.page ? "active" : ""}
              key={item.page}
              onClick={() => navigate(item.page)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button className="header-cta" onClick={() => navigate("calculate")}>
          Calculate fare <Icon name="arrow" size={17} />
        </button>
        <button
          className="menu-button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <Icon name={mobileOpen ? "close" : "menu"} />
        </button>
        {mobileOpen && (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <button key={item.page} onClick={() => navigate(item.page)}>
                {item.label} <Icon name="chevron" size={17} />
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="page" key={page}>
        {!validPage && <section className="inner-page"><div className="page-title"><span className="eyebrow">404</span><h1>A route not found.</h1><p>That page does not exist. Your fare tools are still here.</p></div><button className="primary-button" onClick={() => navigate("home")}>Back to home</button></section>}
        {page === "admin" && <Admin onSaved={() => setReload((value) => value + 1)} />}
        {calculationNotice && <div className="cost-update-status" role="alert"><Icon name="info" size={16} />{calculationNotice}</div>}
        <div className="cost-update-status" role="status">
          <Icon name="fuel" size={16} />
          <span>{costData?.snapshot
            ? `${costData.snapshot.research ? "Reviewed Gemini fuel research" : "Sourced operating costs"}${costData.status === "current" ? "" : " · update overdue"} · ${costData.snapshot.location} · ${new Date(costData.snapshot.observedAt).toLocaleDateString("en-IN")} · estimates recalculate automatically`
            : costData === null ? "Checking verified operating costs…" : "Daily cost feed not active · fares use illustrative prototype rates"}</span>
        </div>
        {page === "home" && (
          <>
            <section className="home-hero">
              <div className="hero-copy">
                <span className="eyebrow">Built for Kerala · Made for everyone</span>
                <h1>
                  Know your
                  <br />
                  <em>fair fare.</em>
                </h1>
                <p>
                  A transparent transportation fare calculator designed to balance passenger
                  affordability with driver sustainability.
                </p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={() => navigate("calculate")}>
                    Calculate fare <Icon name="arrow" size={18} />
                  </button>
                  <button className="text-button" onClick={() => navigate("fares")}>
                    Explore fare data
                  </button>
                </div>
                <div className="trust-line">
                  <span><Icon name="check" size={15} /> Transparent breakdown</span>
                  <span><Icon name="check" size={15} /> Government fares kept distinct</span>
                </div>
              </div>
              <div className="hero-visual">
                <div className="hero-stamp">
                  <Icon name="shield" size={20} />
                  <span>THE KERALA<br />TRANSPORT ATLAS</span>
                </div>
                <HeroIllustration />
                <div className="visual-caption">
                  <span>10.8505° N · 76.2711° E</span>
                  <strong>Clearer fares for every journey.</strong>
                </div>
              </div>
            </section>

            <section className="quick-section">
              <div className="quick-intro">
                <span className="section-number">01</span>
                <div>
                  <span className="eyebrow">Quick calculator</span>
                  <h2>Start with your journey.</h2>
                </div>
              </div>
              <div className="quick-calculator">
                <label>
                  <span>Vehicle</span>
                  <select value={selectedId} onChange={(event) => setSelectedId(event.target.value as VehicleId)}>
                    {vehicles.map((vehicle) => (
                      <option value={vehicle.id} key={vehicle.id}>{vehicle.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Distance</span>
                  <span className="input-with-unit">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={distance}
                      onChange={(event) => setDistance(event.target.value)}
                      aria-label="Distance in kilometres"
                    />
                    <small>km</small>
                  </span>
                </label>
                <button className="quick-submit" onClick={calculate} disabled={calculating || !distanceNumber || distanceNumber > 2000}>
                  {calculating ? "Calculating…" : "Calculate fair fare"} <Icon name="arrow" size={18} />
                </button>
              </div>
            </section>

            <section className="why-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Why Fare Keralam?</span>
                  <h2>A fare should make sense<br />to everyone.</h2>
                </div>
                <p>
                  We turn complex classifications and cost inputs into a clear answer—without
                  hiding how it was reached.
                </p>
              </div>
              <div className="principle-grid">
                {[
                  ["01", "Transparent", "See the components behind every recommendation.", "document"],
                  ["02", "Fair", "Balance affordable journeys with sustainable driving.", "shield"],
                  ["03", "Responsive", "Reflect real operating costs as they change.", "chart"],
                ].map(([number, title, copy, icon]) => (
                  <article className="principle-card" key={title}>
                    <div className="principle-top"><span>{number}</span><Icon name={icon as IconName} /></div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="steps-section">
              <span className="eyebrow eyebrow-light">How it works</span>
              <h2>From journey to understanding<br />in under 30 seconds.</h2>
              <div className="steps-grid">
                {[
                  ["01", "Choose your vehicle"],
                  ["02", "Enter your journey"],
                  ["03", "Calculate the fare"],
                  ["04", "Understand the result"],
                ].map(([number, label]) => (
                  <div className="step" key={number}><span>{number}</span><strong>{label}</strong></div>
                ))}
              </div>
            </section>

            <section className="factors-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">What shapes a sustainable fare?</span>
                  <h2>The real cost of<br />keeping Kerala moving.</h2>
                </div>
                <button className="text-button" onClick={() => navigate("costs")}>
                  Explore cost data <Icon name="arrow" size={17} />
                </button>
              </div>
              <div className="factor-row">
                {costFactors.map((factor) => (
                  <div className="factor" key={factor.label}>
                    <span><Icon name={factor.icon} /></span>
                    <strong>{factor.label}</strong>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {page === "vehicles" && (
          <section className="inner-page">
            <div className="page-title">
              <span className="eyebrow">Step 1 of 2</span>
              <h1>Choose your vehicle.</h1>
              <p>Select the government vehicle category that best matches your journey.</p>
            </div>
            <div className="vehicle-grid">
              {vehicles.map((vehicle) => (
                <button
                  className={`vehicle-card ${selectedId === vehicle.id ? "selected" : ""}`}
                  key={vehicle.id}
                  onClick={() => setSelectedId(vehicle.id)}
                >
                  <span className="vehicle-check"><Icon name="check" size={15} /></span>
                  <span className="vehicle-icon"><Icon name={vehicle.icon} size={42} /></span>
                  <span className="vehicle-name">{vehicle.name}</span>
                  <span className="vehicle-description">{vehicle.description}</span>
                  <span className="vehicle-detail">{vehicle.detail}</span>
                  <span className="select-label">{selectedId === vehicle.id ? "Selected" : "Select"} <Icon name="arrow" size={16} /></span>
                </button>
              ))}
            </div>
            <DataNotice>
              These are the five estimate categories supported by Fare Keralam. The reference
              classification catalogue is not a live government certification or tariff feed.
            </DataNotice>
            <div className="classification-catalog">
              <div className="catalog-heading">
                <div>
                  <span className="eyebrow">Government classification</span>
                  <h2>All supported classifications</h2>
                </div>
                <span className="live-data-label"><span /> Reference structure</span>
              </div>
              <div className="classification-columns">
                {governmentClasses.map((group) => (
                  <div className="classification-group" key={group.name}>
                    <h3>{group.name}</h3>
                    {group.items.map((item) => (
                      <div className="classification-item" key={item.name}>
                        <span><Icon name={group.name === "Stage Carriage" ? "bus" : "cab"} size={17} /></span>
                        <div><strong>{item.name}</strong><small>{item.note}</small></div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="page-actions">
              <button className="primary-button" onClick={() => navigate("calculate")}>
                Continue with {selected.short} <Icon name="arrow" size={18} />
              </button>
            </div>
          </section>
        )}

        {page === "calculate" && (
          <section className="calculator-page">
            <div className="calculator-form-panel">
              <span className="eyebrow">Fare calculator</span>
              <h1>Tell us about<br />your journey.</h1>
              <p className="panel-intro">Only the information needed for this vehicle is shown.</p>

              <div className="field-group">
                <label>Vehicle category</label>
                <button className="vehicle-select" onClick={() => navigate("vehicles")}>
                  <span className="mini-vehicle-icon"><Icon name={selected.icon} size={25} /></span>
                  <span><strong>{selected.name}</strong><small>{selected.detail}</small></span>
                  <span className="change-label">Change</span>
                </button>
              </div>

              <div className="field-group">
                <label htmlFor="distance">Journey distance</label>
                <span className="large-distance-input">
                  <input
                    id="distance"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={distance}
                    onChange={(event) => setDistance(event.target.value)}
                  />
                  <small>km</small>
                </span>
                <span className="field-hint"><Icon name="route" size={15} /> Enter the total one-way distance</span>
              </div>

              {selected.requiresSeats && (
                <div className="field-group">
                  <label htmlFor="seats">Seating capacity</label>
                  <span className="large-distance-input">
                    <input
                      id="seats"
                      type="number"
                      min="1"
                      step="1"
                      value={seatingCapacity}
                      onChange={(event) => setSeatingCapacity(event.target.value)}
                    />
                    <small>seats</small>
                  </span>
                  <span className="field-hint"><Icon name="info" size={15} /> Required for {selected.name}</span>
                </div>
              )}

              {selected.id === "bus" && (
                <div className="classification-fields">
                  <div className="field-group">
                    <label htmlFor="stage-service">Stage Carriage service</label>
                    <select
                      id="stage-service"
                      value={stageService}
                      onChange={(event) => setStageService(event.target.value)}
                    >
                      {stageCarriageServices.map((service) => <option key={service}>{service}</option>)}
                    </select>
                  </div>
                  {stageService === "Luxury / High-Tech / AC" && (
                    <div className="field-group">
                      <label htmlFor="stage-configuration">Vehicle configuration</label>
                      <select
                        id="stage-configuration"
                        value={stageConfiguration}
                        onChange={(event) => setStageConfiguration(event.target.value)}
                      >
                        {luxuryConfigurations.map((configuration) => <option key={configuration}>{configuration}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {selected.id === "contract" && (
                <div className="field-group">
                  <label>Government configuration</label>
                  <div className="readonly-classification">
                    <span className="mini-vehicle-icon"><Icon name="van" size={22} /></span>
                    <span><strong>Traveller / Contract vehicles</strong><small>Contract Carriage configuration</small></span>
                  </div>
                </div>
              )}

              <button className="optional-toggle" onClick={() => setDetailsOpen((open) => !open)}>
                <span>Vehicle details <small>Optional</small></span>
                <Icon name="chevron" size={18} />
              </button>
              {detailsOpen && (
                <div className="optional-panel">
                  <p>Operating rates use the energy mix in the sourced vehicle profile. Energy-specific pricing requires separate provider profiles. Capacity and service classifications are reference details; this estimate does not apply seating or service-specific tariff adjustments.</p>
                </div>
              )}

              <button className="primary-button full-button" onClick={calculate} disabled={calculating || !distanceNumber || distanceNumber > 2000}>
                {calculating ? "Calculating…" : "Calculate fair fare"} <Icon name="arrow" size={18} />
              </button>
            </div>
            <aside className="calculator-context">
              <span className="context-icon"><Icon name="shield" size={27} /></span>
              <h2>One estimate.<br />Every part explained.</h2>
              <p>
                Fare Keralam combines the journey, vehicle category and operating-cost model to
                create an understandable recommendation.
              </p>
              <div className="context-points">
                <span><Icon name="check" size={15} /> Official fares shown separately</span>
                <span><Icon name="check" size={15} /> No hidden calculation components</span>
                <span><Icon name="check" size={15} /> Clear informational disclaimer</span>
              </div>
            </aside>
          </section>
        )}

        {page === "result" && (
          <section className="result-page">
            <div className="result-heading">
              <button className="back-button" onClick={() => navigate("calculate")}>
                <span>←</span> Edit journey
              </button>
              <span className="prototype-pill">{calculation.modelStatus === "prototype" ? "Illustrative model" : "Configured estimate model"}</span>
            </div>
            <div className="result-grid">
              <div className="fare-card">
                <span className="eyebrow eyebrow-light">Fare Keralam estimate</span>
                <div className="fare-amount"><small>₹</small>{calculation.total}</div>
                <p>for {distanceNumber.toFixed(1)} km by {selected.name}</p>
                <div className="per-km">
                  <strong>₹{distanceNumber ? (calculation.total / distanceNumber).toFixed(2) : "0.00"}</strong>
                  <span>per kilometre</span>
                </div>
                <div className="result-trust"><Icon name="spark" size={17} /> Transparent recommendation</div>
              </div>
              <div className="breakdown-card">
                <div className="breakdown-title">
                  <div><span className="eyebrow">How we calculated this</span><h2>Fare breakdown</h2></div>
                  <Icon name="chart" size={24} />
                </div>
                <div className="breakdown-rows">
                  <div><span><strong>Base fare</strong><small>Starting component</small></span><b>₹{calculation.base.toFixed(0)}</b></div>
                  <div><span><strong>Distance component</strong><small>{distanceNumber.toFixed(1)} km × ₹{calculation.distanceRate.toFixed(2)}</small></span><b>₹{calculation.distanceFare.toFixed(0)}</b></div>
                  <div><span><strong>Operating-cost component</strong><small>{calculation.costObservedAt ? `Sourced fuel + maintenance + other · ₹${calculation.operatingRate.toFixed(2)}/km` : "Fallback operating allowance · no verified costs"}</small></span><b>₹{calculation.operating.toFixed(0)}</b></div>
                  {calculation.operatingBreakdown && componentKeys.map((component) => <div key={component}><span><strong>{componentLabels[component]}</strong><small>Included in operating cost · {calculation.costStatus === "stale" ? "last known evidence; update required" : "reviewed calculation"}</small></span><b>₹{calculation.operatingBreakdown![component].toFixed(2)}</b></div>)}
                </div>
                <div className="breakdown-total"><span>Fare Keralam estimate</span><strong>₹{calculation.total}</strong></div>
              </div>
            </div>

            <div className="comparison-card">
              <div className="comparison-title">
                <span className="icon-box"><Icon name="document" /></span>
                <div><h2>Official fare comparison</h2><p>Government and Fare Keralam values are always kept distinct.</p></div>
              </div>
              <div className="comparison-values">
                <div><span>Published official rule</span><strong>{officialTotal === null ? "Not available" : `₹${officialTotal}`}</strong><small>{officialRule ? <a className="source-link" href={officialRule.sourceUrl} target="_blank" rel="noreferrer">Source · effective {officialRule.effectiveFrom} ↗</a> : "Awaiting a sourced active fare rule"}</small></div>
                <div className="highlight"><span>Fare Keralam estimate</span><strong>₹{calculation.total}</strong><small>{calculation.modelStatus === "prototype" ? "Illustrative sustainability model" : "Configured recommendation · not official"}</small></div>
                <div><span>Estimate minus official</span><strong>{officialTotal === null ? "—" : `${calculation.total >= officialTotal ? "+" : "−"}₹${Math.abs(calculation.total - officialTotal)}`}</strong><small>Linear tariff only · excludes additional surcharges</small></div>
              </div>
            </div>
            <DataNotice>
              This recommendation is informational, not an official government fare. Formula: base + distance × (distance rate + operating costs). {calculation.costStatus === "stale" && "The latest cost update is overdue; the last verified values are retained."} {calculation.modelStatus === "prototype" && "The model still uses illustrative rates."}
            </DataNotice>
          </section>
        )}

        {page === "fares" && (
          <section className="inner-page explorer-page">
            <div className="page-title split-title">
              <div><span className="eyebrow">Fare explorer</span><h1>Explore Kerala fares.</h1></div>
              <p>Compare official rules and Fare Keralam recommendations without confusing one for the other.</p>
            </div>
            <div className="filter-bar">
              <label><span>Vehicle type</span><select value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}><option value="all">All vehicles</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>
              <label><span>Fare system</span><select value={systemFilter} onChange={(event) => setSystemFilter(event.target.value)}><option value="all">All systems</option><option value="official">Official government fare</option><option value="estimate">Fare Keralam estimate</option></select></label>
              <button onClick={() => { setVehicleFilter("all"); setSystemFilter("all"); }}>Reset filters</button>
              <span className="filter-summary">{filteredVehicles.length} vehicle categories</span>
            </div>
            <DataNotice>
              {catalog.official.length ? "Official records are published separately with their source and effective date. Estimates respond to operating costs; official tariffs do not." : "No sourced official fare records have been published yet. Official values remain blank instead of displaying unverified information."} {catalog.modelStatus === "prototype" && "Recommendation rates are still illustrative."}
            </DataNotice>
            <div className="fare-table-wrap">
              <table>
                <thead><tr><th>Vehicle</th><th>System</th><th>Minimum fare</th><th>Rate</th><th>Effective from</th><th>Status</th></tr></thead>
                <tbody>
                  {filteredVehicles.flatMap((vehicle) => {
                    const official = catalog.official.find((record) => record.vehicleId === vehicle.id);
                    const profile = catalog.profiles[vehicle.id];
                    const costs = costData?.snapshot?.vehicles[vehicle.id];
                    const rate = profile.distanceRate + (costs ? costs.fuelPerKm + costs.maintenancePerKm + costs.otherPerKm : profile.costRate);
                    return [systemFilter !== "estimate" && <tr key={`${vehicle.id}:official`}>
                      <td><span className="table-vehicle"><span><Icon name={vehicle.icon} /></span><strong>{vehicle.name}</strong></span></td>
                      <td>Government</td><td>{official ? `₹${official.minimumFare.toFixed(2)}` : "—"}</td><td>{official ? `₹${official.perKm.toFixed(2)}/km after ${official.includedKm} km` : "—"}</td><td>{official?.effectiveFrom ?? "—"}</td>
                      <td>{official ? <a className="source-link" href={official.sourceUrl} target="_blank" rel="noreferrer">Published source ↗</a> : <span className="status awaiting">Awaiting data</span>}</td>
                    </tr>, systemFilter !== "official" && <tr key={`${vehicle.id}:estimate`}>
                      <td><span className="table-vehicle"><span><Icon name={vehicle.icon} /></span><strong>{vehicle.name}</strong></span></td><td>Fare Keralam</td><td>₹{profile.base.toFixed(2)} base</td><td>₹{rate.toFixed(2)}/km</td><td>{catalog.updatedAt ? new Date(catalog.updatedAt).toLocaleDateString("en-IN") : "—"}</td><td><span className="status">{catalog.modelStatus === "prototype" ? "Illustrative" : costs ? "Cost-linked estimate" : "Fallback estimate"}</span></td>
                    </tr>];
                  })}
                </tbody>
              </table>
            </div>
            <div className="classification-row">
              <span className="icon-box"><Icon name="document" /></span>
              <span><strong>Government vehicle classification</strong><small>2 classes · 14 subclasses · 5 configurations</small></span>
              <span className="verified-label"><Icon name="document" size={14} /> Reference catalogue</span>
            </div>
            <div className="explorer-classifications">
              {governmentClasses.map((group) => (
                <div key={group.name}>
                  <h3>{group.name}</h3>
                  <div>
                    {group.items.map((item) => <span key={item.name}>{item.name}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === "costs" && (
          <section className="inner-page costs-page">
            <div className="page-title split-title">
              <div><span className="eyebrow">Cost transparency</span><h1>What keeps a<br />vehicle moving?</h1></div>
              <p>Six sourced components, one transparent operating-cost model. Published worksheets explain the amount, evidence and mileage behind every rupee.</p>
            </div>
            <label className="history-vehicle">Cost breakdown for<select value={selectedId} onChange={(event) => setSelectedId(event.target.value as VehicleId)}>{vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name}</option>)}</select></label>
            <DataNotice>{selectedBreakdown ? "Shares below are computed from the published six-component worksheet, not preset percentages. Driver earnings are the reviewed target; annual and lifetime costs are allocated per kilometre." : "A complete sourced six-component worksheet has not been published for this category. The chart below is clearly illustrative, not actual Kerala operating-cost data."}</DataNotice>
            {costData?.snapshot && (
              <div className="verified-cost-panel">
                <h2>Verified operating inputs</h2>
                <p>Fuel + maintenance + other costs replace the operating-cost rate in the estimate. Base and distance rates remain unchanged. Official fares are not modified.</p>
                {vehicles.map((vehicle) => {
                  const costs = costData.snapshot!.vehicles[vehicle.id];
                  return costs && <div className="verified-cost-row" key={vehicle.id}>
                    <strong>{vehicle.name}</strong>
                    {costs.breakdown ? componentKeys.map((component) => <span key={component}>{componentLabels[component]} ₹{costs.breakdown![component].toFixed(3)}/km</span>) : <><span>Fuel ₹{costs.fuelPerKm.toFixed(2)}/km</span><span>Maintenance ₹{costs.maintenancePerKm.toFixed(2)}/km</span><span>Other ₹{costs.otherPerKm.toFixed(2)}/km</span></>}
                    <span>{costs.sourceUrls.map((source, index) => <a key={source} href={source} target="_blank" rel="noreferrer">Source {index + 1} ↗ </a>)}</span>
                  </div>;
                })}
              </div>
            )}
            <div className="cost-dashboard">
              <div className="donut-panel">
                <div className="donut" style={donutGradient ? { background: donutGradient } : selectedBreakdown ? { background: "var(--line)" } : undefined} aria-label={selectedBreakdown ? "Computed six-component operating cost breakdown" : "Illustrative operating cost breakdown"}>
                  <div><strong>{selectedBreakdown ? `₹${componentTotal.toFixed(2)}` : "₹100"}</strong><span>{selectedBreakdown ? "per km · per fare unit" : "illustrative operating cost"}</span></div>
                </div>
                <div className="donut-caption"><strong>{selectedBreakdown ? selected.name : "Every ₹100 explained"}</strong><span>{selectedBreakdown ? "Calculated from sourced inputs" : "Illustrative distribution"}</span></div>
              </div>
              <div className="cost-bars">
                {displayedFactors.map((factor) => (
                  <div className="cost-row" key={factor.label}>
                    <span className={`cost-icon ${factor.className}`}><Icon name={factor.icon} /></span>
                    <strong>{factor.label}</strong>
                    <span className="bar-track"><span className={factor.className} style={{ width: factor.value }} /></span>
                    <b>{factor.value}</b>
                  </div>
                ))}
              </div>
            </div>
            {costData?.snapshot?.vehicles[selectedId]?.basis && <div className="verified-cost-panel"><span className="eyebrow">Calculation evidence</span><h2>What each input is based on</h2>{componentKeys.map((component) => { const evidence = costData.snapshot!.vehicles[selectedId]!.basis!.evidence[component]; return <div className="component-evidence" key={component}><strong>{componentLabels[component]}</strong><span>Source effective {evidence.effectiveDate}</span><p>{evidence.note}</p><a className="source-link" href={evidence.sourceUrl} target="_blank" rel="noreferrer">Inspect amount and allocation evidence ↗</a></div>; })}</div>}
            <div className="fuel-panel">
              <div><span className="eyebrow">Fuel prices</span><h2>Verified inputs, clearly sourced.</h2><p>Prices will appear only when a value, update time and reliable source are all available.</p></div>
              <div className="fuel-grid">
                {["Petrol", "Diesel", "CNG", "Electricity"].map((fuel) => {
                  const price = costData?.snapshot?.fuelPrices?.find((value) => value.name.toLowerCase() === fuel.toLowerCase());
                  return <div key={fuel}><span>{fuel}</span><strong>{price ? `₹${price.price.toFixed(2)}` : "—"}</strong><small>{price ? `${price.unit}${price.effectiveDate ? ` · ${price.effectiveDate}` : ""}` : "Awaiting verified data"}</small>{price && <a className="source-link" href={price.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>}</div>;
                })}
              </div>
            </div>
            <div className="verified-cost-panel"><span className="eyebrow">Audit trail</span><h2>Daily cost history</h2><p>Snapshots are retained when costs are published. Select a vehicle to compare the per-kilometre operating inputs over time.</p><label className="history-vehicle">Vehicle<select value={selectedId} onChange={(event) => setSelectedId(event.target.value as VehicleId)}>{vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name}</option>)}</select></label>
              {history.length ? <div className="fare-table-wrap"><table><thead><tr><th>Observed</th><th>Location</th><th>Fuel ₹/km</th><th>Maintenance ₹/km</th><th>Other ₹/km</th><th>Total ₹/km</th></tr></thead><tbody>{history.filter((snapshot) => snapshot.vehicles[selectedId]).map((snapshot) => { const costs = snapshot.vehicles[selectedId]!; return <tr key={snapshot.observedAt}><td>{new Date(snapshot.observedAt).toLocaleDateString("en-IN")}</td><td>{snapshot.location}</td><td>{costs.fuelPerKm.toFixed(2)}</td><td>{costs.maintenancePerKm.toFixed(2)}</td><td>{costs.otherPerKm.toFixed(2)}</td><td>{(costs.fuelPerKm + costs.maintenancePerKm + costs.otherPerKm).toFixed(2)}</td></tr>; })}</tbody></table></div> : <p>No cost snapshots yet. Connect the provider or publish sourced inputs from the admin area.</p>}
            </div>
          </section>
        )}

        {page === "about" && (
          <section className="about-page">
            <div className="about-hero">
              <span className="eyebrow eyebrow-light">Why Fare Keralam?</span>
              <h1>Fair for the passenger.<br /><em>Sustainable for the driver.</em></h1>
              <p>Fare Keralam is a public-interest technology project making transportation fares easier to understand.</p>
            </div>
            <div className="about-content">
              <div className="about-lead">
                <span className="section-number">Our purpose</span>
                <h2>Transparency creates better conversations.</h2>
              </div>
              <div className="about-copy">
                <p>Traditional fare revisions can take time to reflect changes in operating costs. Passengers are often left without a simple way to understand whether a quoted fare is reasonable.</p>
                <p>Fare Keralam explores a clearer approach: monitor relevant costs, respect official classifications, and explain every recommendation in language anyone can understand.</p>
                <div className="mission-quote">“Transparent fares. Sustainable driving. Better understanding.”</div>
              </div>
            </div>
            <div className="about-values">
              {["Passenger affordability", "Driver sustainability", "Transparent calculation", "Kerala-focused data"].map((value, index) => (
                <div key={value}><span>0{index + 1}</span><strong>{value}</strong></div>
              ))}
            </div>
            <DataNotice>Fare Keralam estimates are informational recommendations and are not official government fares unless explicitly identified as such.</DataNotice>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div><Brand /><p>Know your fair fare.</p></div>
        <div className="footer-message"><strong>Transparent fares.</strong><strong>Sustainable driving.</strong><strong>Better understanding.</strong></div>
        <div className="footer-meta"><span>Built for Kerala. Made for everyone.</span><small>{serviceConnected ? "Backend connected" : "Preview · backend connection pending"}</small><button className="text-button" onClick={() => navigate("admin")}>Data administration</button></div>
      </footer>
    </div>
  );
}

const router = createBrowserRouter([{ path: "/:page?", Component: FareApp }, { path: "*", Component: FareApp }]);
export default function App() { return <RouterProvider router={router} />; }
