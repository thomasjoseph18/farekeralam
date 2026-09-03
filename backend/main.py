# ============================================================
# FARE KERALAM - MAIN API
# Production-ready, frontend-compatible FastAPI service
# ============================================================

import math
import os
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict


load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

app = FastAPI(
    title="Fare Keralam API",
    description="Kerala passenger transport fare calculation API.",
    version="2.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://thomasjoseph18.github.io",
        "https://farekeralam.onrender.com",
        "http://localhost:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection():
    if not DATABASE_URL:
        raise HTTPException(status_code=503, detail="Database is not configured")
    try:
        return psycopg2.connect(
            DATABASE_URL,
            cursor_factory=psycopg2.extras.RealDictCursor,
            connect_timeout=10,
        )
    except psycopg2.Error as exc:
        print("Database connection error:", exc)
        raise HTTPException(status_code=503, detail="Unable to connect to database")


def fetch_one(query: str, params=()):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()
    except psycopg2.Error as exc:
        print("Database query error:", exc)
        raise HTTPException(status_code=500, detail="Database query failed")
    finally:
        conn.close()


def fetch_all(query: str, params=()):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall()
    except psycopg2.Error as exc:
        print("Database query error:", exc)
        raise HTTPException(status_code=500, detail="Database query failed")
    finally:
        conn.close()


def money(value: Any) -> float:
    try:
        return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, TypeError):
        return 0.0


def normalize_name(value: Optional[str]) -> str:
    if value is None:
        return ""
    value = str(value).strip().lower()
    for old, new in (("/", " "), ("-", " "), ("_", " "), (".", " ")):
        value = value.replace(old, new)
    return " ".join(value.split())


# Database names are the canonical names. These aliases keep older frontend/API
# inputs working without requiring a database migration.
CATEGORY_ALIASES = {
    "auto": "Auto Rickshaw",
    "auto rickshaw": "Auto Rickshaw",
    "taxi": "Taxi / Motor Cab",
    "motor cab": "Taxi / Motor Cab",
    "taxi motor cab": "Taxi / Motor Cab",
    "maxicab": "Maxicab",
    "maxi cab": "Maxicab",
    "traveller": "Traveller",
    "traveler": "Traveller",
    "contract carriage": "Traveller",
    "tourist vehicle": "Tourist Bus",
    "tourist bus": "Tourist Bus",
    "route bus": "Route Bus",
    "stage carriage": "Route Bus",
}

COMMON_FUEL_BY_CATEGORY = {
    "Auto Rickshaw": "Diesel",
    "Taxi / Motor Cab": "Petrol",
    "Maxicab": "Diesel",
    "Traveller": "Diesel",
    "Route Bus": "Diesel",
    "Tourist Bus": "Diesel",
}


def canonical_category_name(category: Optional[str]) -> Optional[str]:
    if not category:
        return None
    normalized = normalize_name(category)
    return CATEGORY_ALIASES.get(normalized, category.strip())


def common_fuel_for_category(category: str) -> Optional[str]:
    return COMMON_FUEL_BY_CATEGORY.get(category)



# Root of this file is backend/main.py  →  repo root is one level up.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@app.get("/", include_in_schema=False)
def root():
    index_path = os.path.join(_REPO_ROOT, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path, media_type="text/html")
    # Fallback for environments where the frontend files aren't present.
    return {"success": True, "name": "Fare Keralam API", "version": app.version, "status": "online"}


@app.get("/style.css", include_in_schema=False)
def serve_css():
    css_path = os.path.join(_REPO_ROOT, "style.css")
    if os.path.isfile(css_path):
        return FileResponse(css_path, media_type="text/css")
    raise HTTPException(status_code=404, detail="style.css not found")


@app.get("/script.js", include_in_schema=False)
def serve_js():
    js_path = os.path.join(_REPO_ROOT, "script.js")
    if os.path.isfile(js_path):
        return FileResponse(js_path, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="script.js not found")


@app.get("/api/health")
def health():
    configured = bool(DATABASE_URL)
    connected = False
    if configured:
        conn = None
        try:
            conn = get_connection()
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            connected = True
        except Exception as exc:
            print("Health database error:", exc)
        finally:
            if conn:
                conn.close()
    return {
        "status": "healthy" if connected else "degraded",
        "database_configured": configured,
        "database_connected": connected,
    }


@app.get("/api/categories")
def get_categories():
    rows = fetch_all("""
        SELECT id, name, description, requires_model,
               requires_seating_capacity, active, created_at
        FROM vehicle_categories
        WHERE active = TRUE
        ORDER BY id
    """)
    return {"success": True, "count": len(rows), "categories": rows}



@app.get("/api/government-classification")
def get_government_classification():
    try:
        classes=fetch_all("SELECT id,name,description,display_order FROM government_vehicle_classes WHERE active=TRUE ORDER BY display_order,id")
        for cls in classes:
            subs=fetch_all("SELECT id,name,description,display_order FROM government_vehicle_subclasses WHERE class_id=%s AND active=TRUE ORDER BY display_order,id",(cls["id"],))
            for sub in subs:
                configs=fetch_all("SELECT id,name,description,display_order FROM government_vehicle_configurations WHERE subclass_id=%s AND active=TRUE ORDER BY display_order,id",(sub["id"],))
                for cfg in configs:
                    cfg["vehicle_categories"]=fetch_all("SELECT vc.id,vc.name,vc.description FROM government_vehicle_category_map m JOIN vehicle_categories vc ON vc.id=m.vehicle_category_id WHERE m.configuration_id=%s AND m.active=TRUE ORDER BY vc.id",(cfg["id"],))
                sub["configurations"]=configs
                sub["vehicle_categories"]=fetch_all("SELECT vc.id,vc.name,vc.description FROM government_vehicle_category_map m JOIN vehicle_categories vc ON vc.id=m.vehicle_category_id WHERE m.subclass_id=%s AND m.active=TRUE ORDER BY vc.id",(sub["id"],))
            cls["subclasses"]=subs
        return {"success":True,"classes":classes}
    except Exception as exc:
        print("Government classification error:",exc)
        raise HTTPException(status_code=503,detail="Government classification is not initialized. Run the database migration.")

@app.get("/api/energy-sources")
def get_energy_sources():
    rows = fetch_all("""
        SELECT id, name, unit, description, active, created_at
        FROM energy_sources
        WHERE active = TRUE
        ORDER BY id
    """)
    return {"success": True, "count": len(rows), "energy_sources": rows}


def find_category(category_name: str):
    canonical = canonical_category_name(category_name)
    if not canonical:
        return None
    return fetch_one("""
        SELECT id, name, description, requires_model,
               requires_seating_capacity, active
        FROM vehicle_categories
        WHERE active = TRUE
          AND LOWER(TRIM(name)) = LOWER(TRIM(%s))
        LIMIT 1
    """, (canonical,))


@app.get("/api/vehicles")
def get_vehicles(
    category: Optional[str] = None,
    seating_capacity: Optional[int] = Query(None, gt=0),
):
    query = """
        SELECT v.id, v.category_id, v.energy_source_id, v.name,
               v.seating_capacity, v.efficiency, v.efficiency_unit,
               v.active, v.created_at
        FROM vehicles v
        WHERE v.active = TRUE
    """
    params = []
    if category:
        canonical = canonical_category_name(category)
        query += """
            AND v.category_id = (
                SELECT id FROM vehicle_categories
                WHERE active = TRUE
                  AND LOWER(TRIM(name)) = LOWER(TRIM(%s))
                LIMIT 1
            )
        """
        params.append(canonical)
    if seating_capacity is not None:
        query += " AND v.seating_capacity = %s "
        params.append(seating_capacity)
    query += " ORDER BY v.id"
    rows = fetch_all(query, params)
    return {"success": True, "count": len(rows), "vehicles": rows}


@app.get("/api/vehicle-options")
def get_vehicle_options():
    rows = fetch_all("""
        SELECT id, name, description, requires_model,
               requires_seating_capacity
        FROM vehicle_categories
        WHERE active = TRUE
        ORDER BY id
    """)
    return {
        "success": True,
        "categories": [
            {
                "id": r["id"],
                "name": r["name"],
                "description": r["description"],
                "requires_model": bool(r["requires_model"]),
                "requires_seating_capacity": bool(r["requires_seating_capacity"]),
            }
            for r in rows
        ],
    }


def validate_category_requirements(category, seating_capacity: Optional[int]):
    if bool(category["requires_seating_capacity"]) and seating_capacity is None:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Seating capacity is required for this vehicle category",
                "category": category["name"],
            },
        )


def find_vehicle(category_id: int, seating_capacity: Optional[int] = None, vehicle_id: Optional[int] = None):
    base = """
        SELECT v.id, v.category_id, v.energy_source_id, v.name,
               v.seating_capacity, v.efficiency, v.efficiency_unit,
               es.name AS energy_source
        FROM vehicles v
        LEFT JOIN energy_sources es ON es.id = v.energy_source_id
        WHERE v.active = TRUE
    """
    if vehicle_id is not None:
        row = fetch_one(base + " AND v.id = %s LIMIT 1", (vehicle_id,))
        if not row:
            raise HTTPException(status_code=404, detail="Selected vehicle not found")
        if row["category_id"] != category_id:
            raise HTTPException(status_code=400, detail="Selected vehicle does not belong to the selected category")
        return row
    if seating_capacity is not None:
        return fetch_one(
            base + " AND v.category_id = %s AND v.seating_capacity = %s ORDER BY v.id LIMIT 1",
            (category_id, seating_capacity),
        )
    return fetch_one(base + " AND v.category_id = %s ORDER BY v.id LIMIT 1", (category_id,))


class FareCalculationRequest(BaseModel):
    # Extra fields are accepted for backward compatibility with older clients.
    model_config = ConfigDict(extra="ignore")
    category: str = Field(..., min_length=1)
    distance_km: float = Field(..., gt=0)
    seating_capacity: Optional[int] = Field(None, gt=0)
    vehicle_id: Optional[int] = Field(None, gt=0)
    energy_source: Optional[str] = Field(None, min_length=1)


def validate_distance(distance_km: float):
    if not math.isfinite(distance_km) or distance_km <= 0:
        raise HTTPException(status_code=400, detail="Distance must be a finite number greater than zero")
    if distance_km > 10000:
        raise HTTPException(status_code=400, detail="Distance is unrealistically large")


def find_fare_rule(category_id: int):
    return fetch_one("""
        SELECT fr.*
        FROM fare_rules fr
        WHERE fr.category_id = %s
          AND LOWER(TRIM(fr.status)) = 'active'
          AND fr.effective_from <= CURRENT_DATE
          AND (fr.effective_to IS NULL OR fr.effective_to >= CURRENT_DATE)
        ORDER BY fr.effective_from DESC, fr.id DESC
        LIMIT 1
    """, (category_id,))


def find_fare_slabs(fare_rule_id: int):
    return fetch_all("""
        SELECT id, fare_rule_id, from_km, to_km, rate_per_km, created_at
        FROM fare_slabs
        WHERE fare_rule_id = %s
        ORDER BY from_km, id
    """, (fare_rule_id,))


def calculate_from_slabs(distance_km: float, minimum_fare: float, minimum_distance_km: float, slabs):
    validate_distance(distance_km)
    minimum_fare = float(minimum_fare)
    minimum_distance_km = float(minimum_distance_km)
    if minimum_fare < 0 or minimum_distance_km < 0:
        raise ValueError("Invalid minimum fare configuration")

    if distance_km <= minimum_distance_km:
        return {
            "fare": minimum_fare,
            "base_fare": minimum_fare,
            "additional_fare": 0.0,
            "additional_distance_km": 0.0,
            "slab_breakdown": [],
        }

    total = minimum_fare
    covered_until = minimum_distance_km
    breakdown = []

    for slab in slabs:
        from_km = float(slab["from_km"])
        to_km = None if slab["to_km"] is None else float(slab["to_km"])
        rate = float(slab["rate_per_km"])
        if from_km < 0 or rate < 0 or (to_km is not None and to_km <= from_km):
            continue

        start = max(minimum_distance_km, covered_until, from_km)
        end = distance_km if to_km is None else min(distance_km, to_km)
        if end <= start:
            continue

        slab_distance = end - start
        amount = slab_distance * rate
        total += amount
        covered_until = max(covered_until, end)
        breakdown.append({
            "from_km": money(start),
            "to_km": money(end),
            "distance_km": money(slab_distance),
            "rate_per_km": money(rate),
            "amount": money(amount),
        })
        if covered_until >= distance_km:
            break

    # Never silently undercharge because a database slab has a gap.
    if covered_until < distance_km:
        raise ValueError("Fare slabs do not cover the requested distance")

    return {
        "fare": total,
        "base_fare": minimum_fare,
        "additional_fare": total - minimum_fare,
        "additional_distance_km": distance_km - minimum_distance_km,
        "slab_breakdown": breakdown,
    }


# Emergency estimates only. They are never labelled official.
FALLBACK_FARES = {
    "Auto Rickshaw": {"minimum_fare": 30.0, "minimum_distance": 1.5, "rate": 15.0},
    "Taxi / Motor Cab": {"minimum_fare": 200.0, "minimum_distance": 5.0, "rate": 18.0},
    "Maxicab": {"minimum_fare": 200.0, "minimum_distance": 5.0, "rate": 20.0},
    "Traveller": {"minimum_fare": 200.0, "minimum_distance": 5.0, "rate": 20.0},
    "Route Bus": {"minimum_fare": 20.0, "minimum_distance": 1.0, "rate": 10.0},
    "Tourist Bus": {"minimum_fare": 200.0, "minimum_distance": 5.0, "rate": 20.0},
}


def fallback_fare(category: str, distance_km: float):
    validate_distance(distance_km)
    config = FALLBACK_FARES.get(category)
    if not config:
        raise HTTPException(status_code=500, detail="No fallback fare configuration exists for this category")
    extra = max(0.0, distance_km - config["minimum_distance"])
    fare = config["minimum_fare"] + extra * config["rate"]
    return {
        "fare": fare,
        "base_fare": config["minimum_fare"],
        "additional_fare": max(0.0, fare - config["minimum_fare"]),
        "additional_distance_km": extra,
        "rate_per_km": config["rate"],
    }


def build_calculation_response(category_name, distance_km, seating_capacity, vehicle, energy_source, **values):
    common_fuel = common_fuel_for_category(category_name)
    selected_energy = energy_source or (vehicle.get("energy_source") if vehicle else None) or common_fuel
    calculation = {
        "category": category_name,
        "distance_km": money(distance_km),
        "seating_capacity": seating_capacity,
        "vehicle": vehicle,
        # Both names are retained because older frontend versions use energy_source
        # while the current API documentation uses common_fuel.
        "energy_source": selected_energy,
        "common_fuel": common_fuel,
        "currency": "INR",
        **values,
    }
    return {"success": True, "calculation": calculation}


@app.post("/api/fare/calculate")
def calculate_fare(request: FareCalculationRequest):
    validate_distance(request.distance_km)

    category = find_category(request.category)
    if not category:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "Vehicle/fare category not found",
                "requested": request.category,
                "normalized": normalize_name(request.category),
            },
        )

    category_id = category["id"]
    category_name = category["name"]
    validate_category_requirements(category, request.seating_capacity)

    vehicle = find_vehicle(category_id, request.seating_capacity, request.vehicle_id)
    fare_rule = find_fare_rule(category_id)

    if fare_rule:
        try:
            minimum_fare = float(fare_rule["minimum_fare"])
            minimum_distance = float(fare_rule["minimum_distance_km"])
            slabs = find_fare_slabs(fare_rule["id"])
            result = calculate_from_slabs(request.distance_km, minimum_fare, minimum_distance, slabs)
        except (ValueError, TypeError) as exc:
            print("Fare rule calculation error:", exc)
            raise HTTPException(status_code=500, detail="Invalid fare rule configuration")

        return build_calculation_response(
            category_name,
            request.distance_km,
            request.seating_capacity,
            vehicle,
            request.energy_source,
            fare=money(result["fare"]),
            calculation_method="database_fare_rule",
            fare_rule_id=fare_rule["id"],
            government_reference=fare_rule.get("government_reference"),
            minimum_fare=money(minimum_fare),
            minimum_distance_km=money(minimum_distance),
            additional_distance_km=money(result["additional_distance_km"]),
            additional_fare=money(result["additional_fare"]),
            slab_breakdown=result["slab_breakdown"],
            fare_source="database",
        )

    fallback = fallback_fare(category_name, request.distance_km)
    config = FALLBACK_FARES[category_name]
    return build_calculation_response(
        category_name,
        request.distance_km,
        request.seating_capacity,
        vehicle,
        request.energy_source,
        fare=money(fallback["fare"]),
        calculation_method="fallback_estimate",
        fare_rule_id=None,
        government_reference=None,
        minimum_fare=money(fallback["base_fare"]),
        minimum_distance_km=money(config["minimum_distance"]),
        additional_distance_km=money(fallback["additional_distance_km"]),
        additional_fare=money(fallback["additional_fare"]),
        rate_per_km=money(fallback["rate_per_km"]),
        fare_source="fallback_estimate",
        warning=(
            "No active government fare rule was found in the database. "
            "This is only an estimate and must not be treated as an official fare."
        ),
    )


@app.get("/api/fare/test")
def fare_test(category: str = "Auto Rickshaw", distance_km: float = 10.0):
    return calculate_fare(FareCalculationRequest(category=category, distance_km=distance_km))


@app.get("/api/fare-rules")
def get_fare_rules(category: Optional[str] = None):
    query = """
        SELECT fr.id, fr.category_id, vc.name AS category,
               fr.minimum_fare, fr.minimum_distance_km,
               fr.effective_from, fr.effective_to, fr.source_id,
               fr.government_reference, fr.status, fr.notes, fr.created_at
        FROM fare_rules fr
        INNER JOIN vehicle_categories vc ON vc.id = fr.category_id
        WHERE 1 = 1
    """
    params = []
    if category:
        query += " AND LOWER(TRIM(vc.name)) = LOWER(TRIM(%s))"
        params.append(canonical_category_name(category))
    query += " ORDER BY fr.category_id, fr.effective_from DESC, fr.id DESC"
    rows = fetch_all(query, params)
    return {"success": True, "count": len(rows), "fare_rules": rows}


@app.get("/api/fare-rules/{fare_rule_id}")
def get_fare_rule(fare_rule_id: int):
    rule = fetch_one("""
        SELECT fr.id, fr.category_id, vc.name AS category,
               fr.minimum_fare, fr.minimum_distance_km,
               fr.effective_from, fr.effective_to, fr.source_id,
               fr.government_reference, fr.status, fr.notes, fr.created_at
        FROM fare_rules fr
        INNER JOIN vehicle_categories vc ON vc.id = fr.category_id
        WHERE fr.id = %s
        LIMIT 1
    """, (fare_rule_id,))
    if not rule:
        raise HTTPException(status_code=404, detail="Fare rule not found")
    return {"success": True, "fare_rule": rule, "slabs": find_fare_slabs(fare_rule_id)}


@app.get("/api/debug/database")
def debug_database():
    tables = {}
    table_names = [
        "vehicle_categories", "energy_sources", "vehicles", "fare_rules",
        "fare_slabs", "cost_categories", "data_sources", "cost_data",
        "price_history", "cost_index_history",
    ]
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            for table in table_names:
                try:
                    cursor.execute(f"SELECT COUNT(*) AS count FROM {table}")
                    tables[table] = cursor.fetchone()["count"]
                except psycopg2.Error as exc:
                    print(f"Table {table} error:", exc)
                    conn.rollback()
                    tables[table] = 0
        return {"success": True, "tables": tables}
    finally:
        conn.close()


@app.on_event("startup")
def startup_event():
    print("Fare Keralam API starting...")
    print("Database configured:", bool(DATABASE_URL))
    print("Fare calculation: DATABASE CATEGORY RULES")
    print("Fuel: informational only; never used as passenger fare selector")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
