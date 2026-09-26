const useRenderApi = window.location.hostname === "thomasjoseph18.github.io" || window.location.protocol === "file:" || (["localhost", "127.0.0.1"].includes(window.location.hostname) && ["3000", "5500"].includes(window.location.port));
const API_BASE = useRenderApi ? "https://farekeralam.onrender.com/api" : "/api";
const API = {
  health: `${API_BASE}/health`,
  classification: `${API_BASE}/government-classification`,
  vehicles: `${API_BASE}/vehicles`,
  calculate: `${API_BASE}/fare/calculate`
};
const $ = (id) => document.getElementById(id);
const state = { classes: [], categories: [], vehicles: [], loading: false };
const bool = (value) => value === true || value === 1 || value === "1" || value === "true" || value === "TRUE";
const show = (element, visible) => { if (element) element.style.display = visible ? "" : "none"; };
const setText = (id, value) => { const element = $(id); if (element) element.textContent = value; };
const setValue = (id, value) => { const element = $(id); if (element) element.value = value; };
const fmt = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
};

function setPlaceholder(select, label) {
  if (!select) return;
  select.replaceChildren();
  const option = document.createElement("option");
  option.value = "";
  option.textContent = label;
  option.disabled = true;
  option.selected = true;
  select.appendChild(option);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    mode: "cors",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* Keep non-JSON responses readable below. */ }
  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : `API error ${response.status}`);
  }
  return data;
}

function selectedClass() {
  return state.classes.find((item) => Number(item.id) === Number($("governmentClass")?.value));
}
function selectedSubclass() {
  return selectedClass()?.subclasses?.find((item) => Number(item.id) === Number($("governmentSubclass")?.value));
}
function selectedConfiguration() {
  return selectedSubclass()?.configurations?.find((item) => Number(item.id) === Number($("governmentConfiguration")?.value));
}
function mappedCategory() {
  return selectedConfiguration()?.vehicle_categories?.[0] || selectedSubclass()?.vehicle_categories?.[0] || null;
}

function populateClasses() {
  const select = $("governmentClass");
  if (!select) return;
  setPlaceholder(select, "Select vehicle category");
  state.classes.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  });
  select.disabled = state.classes.length === 0;
}

function populateSubclasses() {
  const classification = selectedClass();
  const select = $("governmentSubclass");
  setPlaceholder(select, "Select a vehicle type");
  (classification?.subclasses || []).forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  });
  show($("governmentSubclassGroup"), Boolean(classification));
  show($("governmentConfigurationGroup"), false);
  setValue("category", "");
  updateOperational();
}

function populateConfigurations() {
  const subclass = selectedSubclass();
  const select = $("governmentConfiguration");
  setPlaceholder(select, "Select a configuration");
  (subclass?.configurations || []).forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  });
  show($("governmentConfigurationGroup"), Boolean(subclass?.configurations?.length));
  updateOperational();
}

function updateOperational() {
  const category = mappedCategory();
  setValue("category", category?.name || "");
  updateRequirements();
  populateVehicles();
}

function updateRequirements() {
  const category = state.categories.find((item) => item.name === $("category")?.value);
  const needsSeats = Boolean(category && bool(category.requires_seating_capacity));
  show($("seatingGroup"), needsSeats);
  show($("vehicleGroup"), Boolean(category && bool(category.requires_model)));
  const seating = $("seating");
  if (seating) {
    seating.required = needsSeats;
    setPlaceholder(seating, "Select seats");
    if (needsSeats) {
      const capacities = [...new Set(state.vehicles
        .filter((vehicle) => Number(vehicle.category_id) === Number(category.id))
        .map((vehicle) => vehicle.seating_capacity)
        .filter((value) => value != null))].sort((a, b) => a - b);
      capacities.forEach((capacity) => {
        const option = document.createElement("option");
        option.value = capacity;
        option.textContent = `${capacity} seats`;
        seating.appendChild(option);
      });
    }
  }
}

function populateVehicles() {
  const select = $("vehicle");
  if (!select) return;
  const category = state.categories.find((item) => item.name === $("category")?.value);
  const seats = Number($("seating")?.value) || null;
  let vehicles = state.vehicles;
  if (category) vehicles = vehicles.filter((item) => Number(item.category_id) === Number(category.id));
  if (seats) vehicles = vehicles.filter((item) => item.seating_capacity == null || Number(item.seating_capacity) === seats);
  setPlaceholder(select, vehicles.length ? "Select a model" : "No matching vehicle");
  vehicles.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.seating_capacity != null ? `${item.name} — ${item.seating_capacity} seats` : item.name;
    select.appendChild(option);
  });
}

function showEmptyResult() {
  show($("resultEmpty"), true);
  show($("resultSuccess"), false);
  show($("resultError"), false);
}
function showError(message) {
  setText("errorMessage", message);
  show($("resultEmpty"), false);
  show($("resultSuccess"), false);
  show($("resultError"), true);
}

function displayCalculation(calculation) {
  setText("fareAmount", fmt(calculation.fare));
  setText("resultCategory", calculation.category || "—");
  setText("resultDistance", fmt(calculation.distance_km));
  setText("resultSeats", calculation.seating_capacity != null ? `${calculation.seating_capacity} seats` : "—");
  setText("resultVehicle", calculation.vehicle?.name || calculation.category || "—");
  setText("calculationMethod", calculation.calculation_method === "database_fare_rule"
    ? "Government fare rule"
    : calculation.calculation_method || "Fare estimate");
  setText("minimumFare", fmt(calculation.minimum_fare));
  setText("additionalDistance", fmt(calculation.additional_distance_km));
  setText("additionalFare", fmt(calculation.additional_fare));
  setText("fareRuleNote", calculation.fare_source === "database"
    ? `Calculated from the database fare rule. ${calculation.government_reference || ""}`.trim()
    : "This is a fallback estimate and is not an official fare.");

  const breakdown = $("slabBreakdown");
  if (breakdown) {
    breakdown.replaceChildren();
    (calculation.slab_breakdown || []).forEach((slab) => {
      const row = document.createElement("div");
      row.className = "slab-row";
      row.innerHTML = `<span>${fmt(slab.from_km)}–${fmt(slab.to_km)} km</span><strong>₹${fmt(slab.amount)} <small>(${fmt(slab.rate_per_km)}/km)</small></strong>`;
      breakdown.appendChild(row);
    });
  }
  show($("slabSection"), Boolean(calculation.slab_breakdown?.length));
  show($("resultEmpty"), false);
  show($("resultSuccess"), true);
  show($("resultError"), false);
}

async function calculate() {
  if (state.loading) return;
  const category = state.categories.find((item) => item.name === $("category")?.value);
  const distance = Number($("distance")?.value);
  const seats = Number($("seating")?.value) || null;
  const vehicleId = Number($("vehicle")?.value) || null;
  if (!category) return showError("Choose a vehicle classification linked to a fare category.");
  if (!Number.isFinite(distance) || distance <= 0) return showError("Enter a valid journey distance.");
  if (bool(category.requires_seating_capacity) && !seats) return showError("Select the seating capacity.");

  const body = { category: category.name, distance_km: distance, government_subclass: selectedSubclass()?.name || null, government_configuration: selectedConfiguration()?.name || null };
  if (seats) body.seating_capacity = seats;
  if (vehicleId) body.vehicle_id = vehicleId;
  state.loading = true;
  const button = $("calculateBtn");
  if (button) button.disabled = true;
  try {
    const response = await api(API.calculate, { method: "POST", body: JSON.stringify(body) });
    if (!response?.success || !response.calculation) throw new Error("Invalid fare calculation response");
    displayCalculation(response.calculation);
  } catch (error) {
    console.error("Fare calculation failed:", error);
    showError(error.message || "Unable to calculate this fare. Check the selected vehicle type and try again.");
  } finally {
    state.loading = false;
    if (button) button.disabled = false;
  }
}

async function loadClassification(attempt = 1) {
  const select = $("governmentClass");
  const status = $("classStatus");
  try {
    const response = await api(API.classification);
    state.classes = response?.classes || [];
    populateClasses();
    if (state.classes.length) {
      show(status, false);
    } else if (status) {
      status.textContent = "No vehicle classifications are available yet.";
    }
  } catch (error) {
    console.warn(`Classification request ${attempt} failed:`, error.message);
    if (attempt < 3) {
      if (status) status.textContent = "Loading classifications… trying again.";
      window.setTimeout(() => loadClassification(attempt + 1), 4000);
    } else {
      if (select) select.disabled = true;
      if (status) status.textContent = "Vehicle categories couldn’t be loaded. Refresh to try again.";
    }
  }
}

async function init() {
  setText("currentYear", new Date().getFullYear());
  showEmptyResult();
  const results = await Promise.allSettled([
    api(API.health),
    api(`${API_BASE}/categories`),
    api(API.vehicles)
  ]);
  const [healthResult, categoriesResult, vehiclesResult] = results;
  if (categoriesResult.status === "fulfilled") state.categories = categoriesResult.value?.categories || [];
  if (vehiclesResult.status === "fulfilled") state.vehicles = vehiclesResult.value?.vehicles || [];
  setText("categoryCount", categoriesResult.status === "fulfilled" ? state.categories.length : "—");
  setText("vehicleCount", vehiclesResult.status === "fulfilled" ? state.vehicles.length : "—");
  setText("vehicleCountStat", vehiclesResult.status === "fulfilled" ? state.vehicles.length : "—");

  const serviceOnline = healthResult.status === "fulfilled"
    && healthResult.value?.status === "healthy"
    && categoriesResult.status === "fulfilled"
    && vehiclesResult.status === "fulfilled";
  setText("footerStatus", serviceOnline ? "Fare data service online" : "Fare data service unavailable");
  const badge = $("heroApiStatus");
  if (badge) {
    badge.classList.toggle("online", serviceOnline);
    badge.innerHTML = `<span class="status-dot" aria-hidden="true"></span>${serviceOnline ? "Fare data online" : "Fare data unavailable"}`;
  }
  loadClassification();
}

document.addEventListener("DOMContentLoaded", () => {
  $("fareForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    calculate();
  });
  $("governmentClass")?.addEventListener("change", populateSubclasses);
  $("governmentSubclass")?.addEventListener("change", populateConfigurations);
  $("governmentConfiguration")?.addEventListener("change", updateOperational);
  $("seating")?.addEventListener("change", populateVehicles);
  $("resetBtn")?.addEventListener("click", () => {
    $("fareForm")?.reset();
    showEmptyResult();
    populateSubclasses();
  });
  $("retryBtn")?.addEventListener("click", calculate);
  $("mobileMenuBtn")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const navigation = $("mainNav");
    if (!navigation) return;
    const isOpen = navigation.classList.toggle("open");
    button.setAttribute("aria-expanded", String(isOpen));
    button.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });
  $("mainNav")?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    $("mainNav")?.classList.remove("open");
    $("mobileMenuBtn")?.setAttribute("aria-expanded", "false");
    $("mobileMenuBtn")?.setAttribute("aria-label", "Open navigation");
  }));
  init();
});
