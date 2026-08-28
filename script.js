const API_BASE = "https://farekeralam.onrender.com/api";

const API = {
    health: `${API_BASE}/health`,
    categories: `${API_BASE}/categories`,
    energySources: `${API_BASE}/energy-sources`,
    vehicles: `${API_BASE}/vehicles`,
    calculate: `${API_BASE}/fare/calculate`
};

const state = {
    categories: [],
    energySources: [],
    vehicles: [],
    selectedCategory: null,
    selectedEnergy: null,
    selectedVehicle: null,
    selectedSeating: null,
    loading: false,
    lastCalculation: null
};

const elements = {};

function cacheElements() {
    const ids = [
        "pageLoader", "category", "energy", "vehicle", "seating", "distance",
        "fareForm", "calculateBtn", "resetBtn", "retryBtn", "resultCard",
        "resultEmpty", "resultSuccess", "resultError", "errorMessage",
        "fareAmount", "resultCategory", "resultEnergy", "resultDistance",
        "resultSeats", "resultVehicle", "calculationMethod", "minimumFare",
        "additionalDistance", "additionalFare", "slabBreakdown", "slabSection",
        "fareRuleNote", "vehicleGroup", "seatingGroup", "heroApiStatus",
        "heroVehicle", "heroDistance", "heroFare", "heroEnergy", "categoryCount",
        "energyCount", "vehicleCount", "vehicleCountStat", "footerStatus",
        "footerStatusDot", "mobileMenuBtn", "mainNav", "currentYear", "toast",
        "toastMessage"
    ];
    ids.forEach(id => elements[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id));
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        },
        mode: "cors"
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}

    if (!response.ok) {
        throw new Error(data?.detail || data?.message || `API request failed (${response.status})`);
    }
    return data;
}

async function loadHealth() {
    const data = await apiRequest(API.health);
    if (data?.status === "healthy") {
        setFooterStatus("API online", true);
        updateHeroAPIStatus(true);
    } else {
        setFooterStatus("API unavailable", false);
        updateHeroAPIStatus(false);
    }
    return data;
}

async function loadCategories() {
    const data = await apiRequest(API.categories);
    state.categories = Array.isArray(data?.categories) ? data.categories : [];
    populateCategorySelect();
}

async function loadEnergySources() {
    const data = await apiRequest(API.energySources);
    state.energySources = Array.isArray(data?.energy_sources) ? data.energy_sources : [];
    populateEnergySelect();
}

async function loadVehicles() {
    const data = await apiRequest(API.vehicles);
    state.vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
    populateVehicleSelect();
    updateStats();
}

function populateCategorySelect() {
    const select = elements.category;
    if (!select) return;
    select.innerHTML = "";
    addPlaceholder(select, "Select vehicle category");
    state.categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category.name;
        option.textContent = category.name;
        option.dataset.id = category.id;
        option.dataset.requiresModel = String(category.requires_model);
        option.dataset.requiresSeating = String(category.requires_seating_capacity);
        select.appendChild(option);
    });
}

function populateEnergySelect() {
    const select = elements.energy;
    if (!select) return;
    select.innerHTML = "";
    addPlaceholder(select, "Select fuel / energy");
    state.energySources.forEach(energy => {
        const option = document.createElement("option");
        option.value = energy.name;
        option.textContent = energy.name;
        option.dataset.id = energy.id;
        select.appendChild(option);
    });
}

function populateVehicleSelect() {
    const select = elements.vehicle;
    if (!select) return;
    const vehicles = getFilteredVehicles();
    select.innerHTML = "";
    addPlaceholder(select, vehicles.length ? "Select vehicle model" : "No matching vehicle");
    vehicles.forEach(vehicle => {
        const option = document.createElement("option");
        option.value = vehicle.id;
        option.textContent = buildVehicleLabel(vehicle);
        option.dataset.vehicleId = vehicle.id;
        option.dataset.categoryId = vehicle.category_id;
        option.dataset.energyId = vehicle.energy_source_id;
        select.appendChild(option);
    });
}

function getFilteredVehicles() {
    let vehicles = [...state.vehicles];
    const category = getSelectedCategoryObject();
    const energy = getSelectedEnergyObject();
    const seating = getSelectedSeating();
    if (category) vehicles = vehicles.filter(v => Number(v.category_id) === Number(category.id));
    if (energy) vehicles = vehicles.filter(v => Number(v.energy_source_id) === Number(energy.id));
    if (seating !== null) {
        vehicles = vehicles.filter(v => v.seating_capacity == null || Number(v.seating_capacity) === Number(seating));
    }
    return vehicles;
}

function buildVehicleLabel(vehicle) {
    return vehicle.seating_capacity != null ? `${vehicle.name || "Vehicle"} — ${vehicle.seating_capacity} seats` : (vehicle.name || "Vehicle");
}

function addPlaceholder(select, text) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = text;
    option.disabled = true;
    option.selected = true;
    select.appendChild(option);
}

function setupEventListeners() {
    elements.category?.addEventListener("change", handleCategoryChange);
    elements.energy?.addEventListener("change", handleEnergyChange);
    elements.seating?.addEventListener("change", handleSeatingChange);
    elements.vehicle?.addEventListener("change", handleVehicleChange);
    elements.fareForm?.addEventListener("submit", event => { event.preventDefault(); calculateFare(); });
    elements.resetBtn?.addEventListener("click", resetCalculator);
    elements.retryBtn?.addEventListener("click", calculateFare);
    elements.mobileMenuBtn?.addEventListener("click", () => elements.mainNav?.classList.toggle("open"));
}

function handleCategoryChange() {
    state.selectedCategory = elements.category?.value || null;
    state.selectedVehicle = null;
    state.selectedSeating = null;
    updateCategoryRequirements();
    updateSeatingOptions();
    populateVehicleSelect();
    clearFareResult();
}

function handleEnergyChange() {
    state.selectedEnergy = elements.energy?.value || null;
    state.selectedVehicle = null;
    populateVehicleSelect();
    clearFareResult();
}

function handleSeatingChange() {
    state.selectedSeating = getSelectedSeating();
    state.selectedVehicle = null;
    populateVehicleSelect();
    clearFareResult();
}

function handleVehicleChange() {
    const vehicleId = Number(elements.vehicle?.value);
    state.selectedVehicle = state.vehicles.find(v => Number(v.id) === vehicleId) || null;
    if (state.selectedVehicle?.seating_capacity != null) state.selectedSeating = Number(state.selectedVehicle.seating_capacity);
    updateHeroVehicle();
    clearFareResult();
}

function updateCategoryRequirements() {
    const category = getSelectedCategoryObject();
    const requiresModel = category ? toBoolean(category.requires_model) : false;
    const requiresSeating = category ? toBoolean(category.requires_seating_capacity) : false;
    setGroupVisible(elements.vehicleGroup, !!category && requiresModel);
    setGroupVisible(elements.seatingGroup, !!category && requiresSeating);
    if (elements.vehicle) elements.vehicle.required = requiresModel;
    if (elements.seating) elements.seating.required = requiresSeating;
}

function toBoolean(value) { return value === true || value === 1 || value === "1" || value === "true" || value === "TRUE"; }
function setGroupVisible(element, visible) { if (element) element.style.display = visible ? "" : "none"; }

function updateSeatingOptions() {
    const select = elements.seating;
    if (!select) return;
    const category = getSelectedCategoryObject();
    if (!category || !toBoolean(category.requires_seating_capacity)) {
        select.innerHTML = "";
        addPlaceholder(select, "Select seats");
        state.selectedSeating = null;
        return;
    }
    const capacities = [...new Set(state.vehicles.filter(v => Number(v.category_id) === Number(category.id)).map(v => v.seating_capacity).filter(v => v != null))].sort((a,b) => Number(a)-Number(b));
    select.innerHTML = "";
    addPlaceholder(select, "Select seats");
    capacities.forEach(capacity => {
        const option = document.createElement("option");
        option.value = capacity;
        option.textContent = `${capacity} seats`;
        select.appendChild(option);
    });
}

function getSelectedCategoryObject() { const value = elements.category?.value; return state.categories.find(c => c.name === value) || null; }
function getSelectedEnergyObject() { const value = elements.energy?.value; return state.energySources.find(e => e.name === value) || null; }
function getSelectedSeating() { if (!elements.seating?.value) return null; const value = Number(elements.seating.value); return Number.isFinite(value) ? value : null; }

async function calculateFare() {
    if (state.loading) return;
    clearError();
    const category = getSelectedCategoryObject();
    const energy = getSelectedEnergyObject();
    const distance = Number(elements.distance?.value);
    const seating = getSelectedSeating();
    const vehicleId = Number(elements.vehicle?.value) || null;

    if (!category) return showCalculationError("Please select a vehicle category.");
    if (!energy) return showCalculationError("Please select a fuel or energy source.");
    if (!Number.isFinite(distance) || distance <= 0) return showCalculationError("Please enter a valid journey distance.");
    if (toBoolean(category.requires_seating_capacity) && seating === null) return showCalculationError("Please select the seating capacity.");

    const requestBody = { category: category.name, energy_source: energy.name, distance_km: distance };
    if (seating !== null) requestBody.seating_capacity = seating;
    if (vehicleId) requestBody.vehicle_id = vehicleId;

    state.loading = true;
    setCalculateLoading(true);
    showResultEmpty();
    try {
        const data = await apiRequest(API.calculate, { method: "POST", body: JSON.stringify(requestBody) });
        if (!data?.success || !data.calculation) throw new Error("The server returned an invalid fare calculation.");
        state.lastCalculation = data.calculation;
        displayCalculation(data.calculation);
        showToast("Fare calculated successfully.");
    } catch (error) {
        console.error("Fare calculation failed:", error);
        showCalculationError(error.message || "Unable to calculate fare.");
    } finally {
        state.loading = false;
        setCalculateLoading(false);
    }
}

function displayCalculation(calculation) {
    const fare = Number(calculation.fare);
    if (elements.fareAmount) elements.fareAmount.textContent = formatCurrencyNumber(fare);
    if (elements.resultCategory) elements.resultCategory.textContent = calculation.category || "—";
    if (elements.resultEnergy) elements.resultEnergy.textContent = calculation.energy_source || "—";
    if (elements.resultDistance) elements.resultDistance.textContent = formatNumber(calculation.distance_km);
    if (elements.resultSeats) elements.resultSeats.textContent = calculation.seating_capacity != null ? `${calculation.seating_capacity} seats` : "—";
    if (elements.resultVehicle) elements.resultVehicle.textContent = calculation.vehicle?.name || calculation.category || "—";
    if (elements.calculationMethod) elements.calculationMethod.textContent = formatCalculationMethod(calculation.calculation_method);
    if (elements.minimumFare) elements.minimumFare.textContent = formatNumber(calculation.minimum_fare);
    if (elements.additionalDistance) elements.additionalDistance.textContent = formatNumber(calculation.additional_distance_km);
    if (elements.additionalFare) elements.additionalFare.textContent = formatNumber(calculation.additional_fare);
    renderSlabBreakdown(calculation.slab_breakdown);
    if (elements.fareRuleNote) elements.fareRuleNote.textContent = buildFareRuleNote(calculation);
    updateHeroFromCalculation(calculation);
    showResultSuccess();
}

function renderSlabBreakdown(slabs) {
    if (!elements.slabBreakdown) return;
    elements.slabBreakdown.innerHTML = "";
    if (!Array.isArray(slabs) || !slabs.length) { setGroupVisible(elements.slabSection, false); return; }
    setGroupVisible(elements.slabSection, true);
    slabs.forEach(slab => {
        const row = document.createElement("div");
        row.className = "slab-row";
        row.innerHTML = `<span>${formatNumber(slab.from_km)}–${formatNumber(slab.to_km)} km</span><strong>₹${formatNumber(slab.amount)} <small>(${formatNumber(slab.rate_per_km)}/km)</small></strong>`;
        elements.slabBreakdown.appendChild(row);
    });
}

function buildFareRuleNote(calculation) {
    const ref = calculation.government_reference ? ` ${calculation.government_reference}.` : "";
    return calculation.fare_source === "database" ? `Calculated from the database fare rule.${ref}` : "This is a fallback estimate and is not an official fare.";
}
function formatCalculationMethod(value) { return value === "database_fare_rule" ? "Government fare rule" : (value || "—"); }
function formatNumber(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(2) : "0.00"; }
function formatCurrencyNumber(value) { return formatNumber(value); }

function showResultEmpty() {
    setGroupVisible(elements.resultEmpty, true);
    setGroupVisible(elements.resultSuccess, false);
    setGroupVisible(elements.resultError, false);
}
function showResultSuccess() { setGroupVisible(elements.resultEmpty, false); setGroupVisible(elements.resultSuccess, true); setGroupVisible(elements.resultError, false); }
function showCalculationError(message) { if (elements.errorMessage) elements.errorMessage.textContent = message; setGroupVisible(elements.resultEmpty, false); setGroupVisible(elements.resultSuccess, false); setGroupVisible(elements.resultError, true); }
function clearError() { setGroupVisible(elements.resultError, false); }
function clearFareResult() { if (!state.lastCalculation) showResultEmpty(); else showResultEmpty(); }
function resetCalculator() { elements.fareForm?.reset(); state.selectedCategory = null; state.selectedEnergy = null; state.selectedVehicle = null; state.selectedSeating = null; state.lastCalculation = null; updateCategoryRequirements(); updateSeatingOptions(); populateVehicleSelect(); updateHeroVehicle(); showResultEmpty(); clearError(); }
function setCalculateLoading(loading) { if (!elements.calculateBtn) return; elements.calculateBtn.disabled = loading; elements.calculateBtn.classList.toggle("loading", loading); }
function setFooterStatus(text, online) { if (elements.footerStatus) elements.footerStatus.textContent = text; if (elements.footerStatusDot) elements.footerStatusDot.classList.toggle("online", !!online); }
function updateHeroAPIStatus(online) { if (!elements.heroApiStatus) return; elements.heroApiStatus.classList.toggle("online", !!online); const label = elements.heroApiStatus.lastChild; if (label && label.nodeType === Node.TEXT_NODE) label.textContent = online ? " API online" : " API offline"; }
function updateHeroVehicle() { if (elements.heroVehicle) elements.heroVehicle.textContent = state.selectedVehicle?.name || getSelectedCategoryObject()?.name || "Auto Rickshaw"; }
function updateHeroFromCalculation(c) { if (elements.heroVehicle) elements.heroVehicle.textContent = c.vehicle?.name || c.category || "—"; if (elements.heroDistance) elements.heroDistance.textContent = `${formatNumber(c.distance_km)} km`; if (elements.heroFare) elements.heroFare.textContent = `₹${formatCurrencyNumber(c.fare)}`; if (elements.heroEnergy) elements.heroEnergy.textContent = c.energy_source || "—"; }
function updateStats() { if (elements.categoryCount) elements.categoryCount.textContent = state.categories.length || "0"; if (elements.energyCount) elements.energyCount.textContent = state.energySources.length || "0"; if (elements.vehicleCount) elements.vehicleCount.textContent = state.vehicles.length || "0"; if (elements.vehicleCountStat) elements.vehicleCountStat.textContent = state.vehicles.length || "0"; }
function showToast(message) { if (!elements.toast) return; if (elements.toastMessage) elements.toastMessage.textContent = message; elements.toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2800); }

async function initialize() {
    cacheElements();
    setupEventListeners();
    if (elements.currentYear) elements.currentYear.textContent = new Date().getFullYear();
    updateCategoryRequirements();
    showResultEmpty();
    try {
        // Do not make one failed optional endpoint prevent the calculator from working.
        await loadHealth();
        await Promise.all([loadCategories(), loadEnergySources(), loadVehicles()]);
        updateCategoryRequirements();
        updateSeatingOptions();
        populateVehicleSelect();
    } catch (error) {
        console.error("Fare Keralam initialization failed:", error);
        setFooterStatus("API connection problem", false);
        updateHeroAPIStatus(false);
        showCalculationError("The Fare Keralam API could not be loaded. Please refresh and try again.");
    } finally {
        if (elements.pageLoader) {
            elements.pageLoader.classList.add("hidden");
            setTimeout(() => elements.pageLoader.remove(), 500);
        }
    }
}

document.addEventListener("DOMContentLoaded", initialize);
