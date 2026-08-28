const API_BASE = "https://farekeralam.onrender.com/api";
const API = { health:`${API_BASE}/health`, categories:`${API_BASE}/categories`, energy:`${API_BASE}/energy-sources`, vehicles:`${API_BASE}/vehicles`, calculate:`${API_BASE}/fare/calculate` };
const $ = id => document.getElementById(id);
const state = { categories:[], energy:[], vehicles:[], loading:false };

async function request(url, options={}) {
    const r = await fetch(url, { ...options, mode:"cors", headers:{ Accept:"application/json", ...(options.body?{"Content-Type":"application/json"}:{}) } });
    const text = await r.text();
    let data=null; try { data=text?JSON.parse(text):null; } catch(e) {}
    if (!r.ok) throw new Error(typeof data?.detail === "string" ? data.detail : data?.detail?.message || `API error ${r.status}`);
    return data;
}
function bool(v){ return v===true || v===1 || v==="1" || v==="true"; }
function show(el,on){ if(el) el.style.display=on?"":"none"; }
function fmt(v){ const n=Number(v); return Number.isFinite(n)?n.toFixed(2):"0.00"; }
function placeholder(sel,text){ sel.innerHTML=""; const o=document.createElement("option"); o.value=""; o.textContent=text; o.disabled=true; o.selected=true; sel.appendChild(o); }
function category(){ return state.categories.find(x=>x.name===$("category")?.value); }
function energy(){ return state.energy.find(x=>x.name===$("energy")?.value); }
function seats(){ const v=Number($("seating")?.value); return Number.isFinite(v)&&v>0?v:null; }

function populateCategories(){
    const s=$("category"); if(!s)return; placeholder(s,"Select vehicle category");
    state.categories.forEach(c=>{const o=document.createElement("option");o.value=c.name;o.textContent=c.name;o.dataset.id=c.id;s.appendChild(o);});
}
function populateEnergy(){
    const s=$("energy"); if(!s)return; placeholder(s,"Select fuel / energy");
    state.energy.forEach(e=>{const o=document.createElement("option");o.value=e.name;o.textContent=e.name;o.dataset.id=e.id;s.appendChild(o);});
}
function filteredVehicles(){
    const c=category(), e=energy(), se=seats();
    return state.vehicles.filter(v=>!c||Number(v.category_id)===Number(c.id)).filter(v=>!e||Number(v.energy_source_id)===Number(e.id)).filter(v=>se===null||v.seating_capacity==null||Number(v.seating_capacity)===se);
}
function populateVehicles(){
    const s=$("vehicle"); if(!s)return; const list=filteredVehicles(); placeholder(s,list.length?"Select vehicle model":"No matching vehicle");
    list.forEach(v=>{const o=document.createElement("option");o.value=v.id;o.textContent=v.seating_capacity!=null?`${v.name} — ${v.seating_capacity} seats`:v.name;s.appendChild(o);});
}
function updateForm(){
    const c=category();
    const needsSeats=!!c&&bool(c.requires_seating_capacity);
    show($("seatingGroup"),needsSeats); show($("vehicleGroup"),!!c&&bool(c.requires_model));
    if($("seating")) $("seating").required=needsSeats;
    const s=$("seating");
    if(s){ placeholder(s,"Select seats"); if(needsSeats){const vals=[...new Set(state.vehicles.filter(v=>Number(v.category_id)===Number(c.id)).map(v=>v.seating_capacity).filter(v=>v!=null))].sort((a,b)=>a-b); vals.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=`${v} seats`;s.appendChild(o);});} }
    populateVehicles();
}
function resultEmpty(){show($("resultEmpty"),true);show($("resultSuccess"),false);show($("resultError"),false);}
function resultError(msg){if($("errorMessage"))$("errorMessage").textContent=msg;show($("resultEmpty"),false);show($("resultSuccess"),false);show($("resultError"),true);}
function resultSuccess(){show($("resultEmpty"),false);show($("resultSuccess"),true);show($("resultError"),false);}
function display(c){
    if($("fareAmount"))$("fareAmount").textContent=fmt(c.fare);
    if($("resultCategory"))$("resultCategory").textContent=c.category||"—";
    if($("resultEnergy"))$("resultEnergy").textContent=c.energy_source||c.common_fuel||"—";
    if($("resultDistance"))$("resultDistance").textContent=fmt(c.distance_km);
    if($("resultSeats"))$("resultSeats").textContent=c.seating_capacity!=null?`${c.seating_capacity} seats`:"—";
    if($("resultVehicle"))$("resultVehicle").textContent=c.vehicle?.name||c.category||"—";
    if($("calculationMethod"))$("calculationMethod").textContent=c.calculation_method==="database_fare_rule"?"Government fare rule":c.calculation_method||"—";
    if($("minimumFare"))$("minimumFare").textContent=fmt(c.minimum_fare);
    if($("additionalDistance"))$("additionalDistance").textContent=fmt(c.additional_distance_km);
    if($("additionalFare"))$("additionalFare").textContent=fmt(c.additional_fare);
    if($("fareRuleNote"))$("fareRuleNote").textContent=c.fare_source==="database"?`Calculated from the database fare rule. ${c.government_reference||""}`:"This is a fallback estimate and is not an official fare.";
    if($("heroVehicle"))$("heroVehicle").textContent=c.vehicle?.name||c.category||"—";
    if($("heroDistance"))$("heroDistance").textContent=`${fmt(c.distance_km)} km`;
    if($("heroFare"))$("heroFare").textContent=`₹${fmt(c.fare)}`;
    if($("heroEnergy"))$("heroEnergy").textContent=c.energy_source||c.common_fuel||"—";
    const box=$("slabBreakdown"); if(box){box.innerHTML="";(c.slab_breakdown||[]).forEach(s=>{const d=document.createElement("div");d.className="slab-row";d.innerHTML=`<span>${fmt(s.from_km)}–${fmt(s.to_km)} km</span><strong>₹${fmt(s.amount)} <small>(${fmt(s.rate_per_km)}/km)</small></strong>`;box.appendChild(d);});} show($("slabSection"),Array.isArray(c.slab_breakdown)&&c.slab_breakdown.length>0); resultSuccess();
}
async function calculate(){
    if(state.loading)return; const c=category(),e=energy(),d=Number($("distance")?.value),s=seats(),vid=Number($("vehicle")?.value)||null;
    if(!c)return resultError("Please select a vehicle category.");
    if(!e)return resultError("Please select a fuel or energy source.");
    if(!Number.isFinite(d)||d<=0)return resultError("Please enter a valid journey distance.");
    if(bool(c.requires_seating_capacity)&&s===null)return resultError("Please select the seating capacity.");
    const body={category:c.name,energy_source:e.name,distance_km:d}; if(s!==null)body.seating_capacity=s;if(vid)body.vehicle_id=vid;
    state.loading=true; if($("calculateBtn"))$("calculateBtn").disabled=true; resultEmpty();
    try{const data=await request(API.calculate,{method:"POST",body:JSON.stringify(body)});if(!data?.success||!data.calculation)throw Error("Invalid response from Fare Keralam API");display(data.calculation);}
    catch(err){console.error(err);resultError(err.message||"Unable to calculate fare.");}
    finally{state.loading=false;if($("calculateBtn"))$("calculateBtn").disabled=false;}
}
async function initialize(){
    const loader=$("pageLoader"); if($("currentYear"))$("currentYear").textContent=new Date().getFullYear(); resultEmpty();
    try{
        const [h,c,e,v]=await Promise.all([request(API.health),request(API.categories),request(API.energy),request(API.vehicles)]);
        state.categories=Array.isArray(c?.categories)?c.categories:[]; state.energy=Array.isArray(e?.energy_sources)?e.energy_sources:[]; state.vehicles=Array.isArray(v?.vehicles)?v.vehicles:[];
        populateCategories();populateEnergy();updateForm();
        if($("categoryCount"))$("categoryCount").textContent=state.categories.length;
        if($("energyCount"))$("energyCount").textContent=state.energy.length;
        if($("vehicleCount"))$("vehicleCount").textContent=state.vehicles.length;
        if($("vehicleCountStat"))$("vehicleCountStat").textContent=state.vehicles.length;
        if($("footerStatus"))$("footerStatus").textContent=h?.status==="healthy"?"API online":"API unavailable";
        if($("heroApiStatus"))$("heroApiStatus").classList.toggle("online",h?.status==="healthy");
    }catch(err){console.error("Initialization failed",err);if($("footerStatus"))$("footerStatus").textContent="API connection problem";resultError("The Fare Keralam API could not be loaded. Please refresh and try again.");}
    finally{if(loader){loader.classList.add("hidden");setTimeout(()=>loader.remove(),500);}}
}
document.addEventListener("DOMContentLoaded",()=>{
    $("fareForm")?.addEventListener("submit",e=>{e.preventDefault();calculate();});
    $("category")?.addEventListener("change",updateForm);
    $("energy")?.addEventListener("change",populateVehicles);
    $("seating")?.addEventListener("change",populateVehicles);
    $("resetBtn")?.addEventListener("click",()=>{ $("fareForm")?.reset(); resultEmpty(); updateForm(); });
    $("retryBtn")?.addEventListener("click",calculate);
    $("mobileMenuBtn")?.addEventListener("click",()=>$("mainNav")?.classList.toggle("open"));
    initialize();
});