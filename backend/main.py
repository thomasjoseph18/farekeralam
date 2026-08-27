# ============================================================
# FARE KERALAM - MAIN API
# ============================================================
#
# Simple government-fare based API for Kerala.
#
# IMPORTANT DESIGN:
#   - Fare is NOT calculated differently for petrol/diesel/EV.
#   - Fuel is NOT selected by the passenger.
#   - Government fare category is the primary fare determinant.
#   - Fuel information is retained internally for cost/data purposes.
#
# Frontend should mainly provide:
#   1. Fare category
#   2. Distance
#   3. Seating capacity where required
#
# ============================================================

import os
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("WARNING: DATABASE_URL is not configured")


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Fare Keralam API",
    description=(
        "Simple Kerala passenger transport fare calculation API "
        "using government fare categories and database-backed fare rules."
    ),
    version="2.0.0",
)


# ============================================================
# CORS
# ============================================================

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


# ============================================================
# DATABASE
# ============================================================

def get_connection():
    if not DATABASE_URL:
        raise HTTPException(
            status_code=500,
            detail="Database is not configured",
        )

    try:
        return psycopg2.connect(
            DATABASE_URL,
            cursor_factory=psycopg2.extras.RealDictCursor,
            connect_timeout=10,
        )

    except Exception as exc:
        print("Database connection error:", exc)

        raise HTTPException(
            status_code=500,
            detail="Unable to connect to database",
        )


def fetch_one(query: str, params=()):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()

    finally:
        conn.close()


def fetch_all(query: str, params=()):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall()

    finally:
        conn.close()


# ============================================================
# MONEY
# ============================================================

def money(value: Any) -> float:
    amount = Decimal(str(value))

    return float(
        amount.quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
    )


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_name(value: Optional[str]) -> str:
    if value is None:
        return ""

    value = str(value).strip().lower()

    for old, new in {
        "/": " ",
        "-": " ",
        "_": " ",
        ".": " ",
    }.items():
        value = value.replace(old, new)

    return " ".join(value.split())


# ============================================================
# CATEGORY ALIASES
# ============================================================
#
# These are only convenience aliases.
#
# Fare calculation itself is based on the category stored
# in the database.
# ============================================================

CATEGORY_ALIASES = {

    "auto": "Auto Rickshaw",
    "auto rickshaw": "Auto Rickshaw",

    "quadricycle": "Quadricycle",

    "taxi": "Motor Cab",
    "motor cab": "Motor Cab",
    "taxi motor cab": "Motor Cab",
    "taxi motor cab": "Motor Cab",

    "maxicab": "Maxicab",
    "maxi cab": "Maxicab",

    "contract carriage": "Contract Carriage",
    "traveller": "Contract Carriage",
    "traveler": "Contract Carriage",
    "tourist bus": "Contract Carriage",

    "stage carriage": "Stage Carriage",

    # Stage carriage classes
    "ordinary": "Ordinary / Mofussil",
    "ordinary mofussil": "Ordinary / Mofussil",
    "mofussil": "Ordinary / Mofussil",

    "city fast": "City Fast",

    "fast passenger": "Fast Passenger",

    "super fast": "Super Fast",

    "express": "Express",

    "super express": "Super Express",

    "super deluxe": "Super Deluxe",

    "luxury": "Luxury / AC",
    "luxury ac": "Luxury / AC",

    "single axle": "Single Axle",

    "multi axle": "Multi Axle",

    "low floor": "Low Floor",
}


def canonical_category_name(category: Optional[str]):
    if not category:
        return None

    normalized = normalize_name(category)

    return CATEGORY_ALIASES.get(
        normalized,
        category.strip(),
    )


# ============================================================
# COMMON FUEL KNOWLEDGE
# ============================================================
#
# This is NOT used to determine government fare.
#
# It only represents the commonly used energy source for
# internal vehicle/cost calculations.
#
# The user does NOT select this on the frontend.
# ============================================================

COMMON_FUEL_BY_CATEGORY = {

    "Auto Rickshaw": "Petrol",

    "Quadricycle": "Petrol",

    "Motor Cab": "Petrol",

    "Maxicab": "Diesel",

    "Contract Carriage": "Diesel",

    "Stage Carriage": "Diesel",

    "Ordinary / Mofussil": "Diesel",

    "City Fast": "Diesel",

    "Fast Passenger": "Diesel",

    "Super Fast": "Diesel",

    "Express": "Diesel",

    "Super Express": "Diesel",

    "Super Deluxe": "Diesel",

    "Luxury / AC": "Diesel",

    "Single Axle": "Diesel",

    "Multi Axle": "Diesel",

    "Low Floor": "Diesel",
}


def common_fuel_for_category(category: str):
    return COMMON_FUEL_BY_CATEGORY.get(
        category,
        None,
    )


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "success": True,
        "name": "Fare Keralam API",
        "version": "2.0.0",
        "status": "online",
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
def health():

    database_configured = bool(DATABASE_URL)
    database_connected = False

    if database_configured:

        try:
            conn = get_connection()

            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()

            conn.close()

            database_connected = True

        except Exception as exc:
            print("Health database error:", exc)

    return {
        "status": (
            "healthy"
            if database_connected
            else "degraded"
        ),
        "database_configured": database_configured,
        "database_connected": database_connected,
    }


# ============================================================
# CATEGORIES
# ============================================================

@app.get("/api/categories")
def get_categories():

    query = """
        SELECT
            id,
            name,
            description,
            requires_model,
            requires_seating_capacity,
            active,
            created_at
        FROM vehicle_categories
        WHERE active = TRUE
        ORDER BY id
    """

    try:

        categories = fetch_all(query)

        return {
            "success": True,
            "count": len(categories),
            "categories": categories,
        }

    except Exception as exc:

        print("Categories error:", exc)

        raise HTTPException(
            status_code=500,
            detail="Unable to load vehicle categories",
        )


# ============================================================
# FIND CATEGORY
# ============================================================

def find_category(category_name: str):

    canonical = canonical_category_name(
        category_name
    )

    query = """
        SELECT
            id,
            name,
            description,
            requires_model,
            requires_seating_capacity,
            active
        FROM vehicle_categories
        WHERE active = TRUE
          AND LOWER(TRIM(name))
              = LOWER(TRIM(%s))
        LIMIT 1
    """

    return fetch_one(
        query,
        (canonical,),
    )


# ============================================================
# VEHICLES
# ============================================================
#
# Vehicle records are retained for internal data.
#
# The passenger does NOT need to select fuel.
# ============================================================

@app.get("/api/vehicles")
def get_vehicles(
    category: Optional[str] = None,
    seating_capacity: Optional[int] = None,
):

    query = """
        SELECT
            v.id,
            v.category_id,
            v.energy_source_id,
            v.name,
            v.seating_capacity,
            v.efficiency,
            v.efficiency_unit,
            v.active,
            v.created_at
        FROM vehicles v
        WHERE v.active = TRUE
    """

    params = []

    if category:

        canonical = canonical_category_name(
            category
        )

        query += """
            AND v.category_id = (
                SELECT id
                FROM vehicle_categories
                WHERE LOWER(TRIM(name))
                    = LOWER(TRIM(%s))
                LIMIT 1
            )
        """

        params.append(canonical)

    if seating_capacity is not None:

        query += """
            AND v.seating_capacity = %s
        """

        params.append(
            seating_capacity
        )

    query += """
        ORDER BY v.id
    """

    try:

        vehicles = fetch_all(
            query,
            params,
        )

        return {
            "success": True,
            "count": len(vehicles),
            "vehicles": vehicles,
        }

    except Exception as exc:

        print("Vehicles error:", exc)

        raise HTTPException(
            status_code=500,
            detail="Unable to load vehicles",
        )


# ============================================================
# VEHICLE OPTIONS
# ============================================================
#
# Simplified frontend options.
#
# No fuel selection is returned.
#
# Fuel remains an internal database property.
# ============================================================

@app.get("/api/vehicle-options")
def get_vehicle_options():

    query = """
        SELECT
            vc.id,
            vc.name AS category,
            vc.description,
            vc.requires_seating_capacity
        FROM vehicle_categories vc
        WHERE vc.active = TRUE
        ORDER BY vc.id
    """

    try:

        rows = fetch_all(query)

        categories = []

        for row in rows:

            categories.append({
                "id": row["id"],
                "name": row["category"],
                "description": row["description"],
                "requires_seating_capacity":
                    row["requires_seating_capacity"],
            })

        return {
            "success": True,
            "categories": categories,
        }

    except Exception as exc:

        print(
            "Vehicle options error:",
            exc,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to load vehicle options",
        )


# ============================================================
# FIND VEHICLE
# ============================================================

def find_vehicle(
    category_id: int,
    seating_capacity: Optional[int] = None,
    vehicle_id: Optional[int] = None,
):

    # --------------------------------------------------------
    # Specific vehicle
    # --------------------------------------------------------

    if vehicle_id is not None:

        query = """
            SELECT
                v.id,
                v.category_id,
                v.energy_source_id,
                v.name,
                v.seating_capacity,
                v.efficiency,
                v.efficiency_unit,
                es.name AS energy_source
            FROM vehicles v
            LEFT JOIN energy_sources es
                ON es.id = v.energy_source_id
            WHERE v.id = %s
              AND v.active = TRUE
            LIMIT 1
        """

        vehicle = fetch_one(
            query,
            (vehicle_id,),
        )

        if not vehicle:
            return None

        if vehicle["category_id"] != category_id:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Selected vehicle does not "
                    "belong to the selected category"
                ),
            )

        return vehicle

    # --------------------------------------------------------
    # Seating capacity
    # --------------------------------------------------------

    if seating_capacity is not None:

        query = """
            SELECT
                v.id,
                v.category_id,
                v.energy_source_id,
                v.name,
                v.seating_capacity,
                v.efficiency,
                v.efficiency_unit,
                es.name AS energy_source
            FROM vehicles v
            LEFT JOIN energy_sources es
                ON es.id = v.energy_source_id
            WHERE v.category_id = %s
              AND v.active = TRUE
              AND v.seating_capacity = %s
            ORDER BY v.id
            LIMIT 1
        """

        return fetch_one(
            query,
            (
                category_id,
                seating_capacity,
            ),
        )

    # --------------------------------------------------------
    # Any vehicle in category
    # --------------------------------------------------------

    query = """
        SELECT
            v.id,
            v.category_id,
            v.energy_source_id,
            v.name,
            v.seating_capacity,
            v.efficiency,
            v.efficiency_unit,
            es.name AS energy_source
        FROM vehicles v
        LEFT JOIN energy_sources es
            ON es.id = v.energy_source_id
        WHERE v.category_id = %s
          AND v.active = TRUE
        ORDER BY v.id
        LIMIT 1
    """

    return fetch_one(
        query,
        (category_id,),
    )


# ============================================================
# FARE REQUEST
# ============================================================

class FareCalculationRequest(BaseModel):

    category: str = Field(
        ...,
        min_length=1,
        description="Government fare category",
    )

    distance_km: float = Field(
        ...,
        gt=0,
        description="Journey distance in kilometres",
    )

    seating_capacity: Optional[int] = Field(
        None,
        gt=0,
        description="Required only for applicable categories",
    )

    # Internal/database vehicle reference.
    # Not required by the normal frontend.
    vehicle_id: Optional[int] = Field(
        None,
        gt=0,
    )


# ============================================================
# FIND FARE RULE
# ============================================================
#
# IMPORTANT:
#
# Fare rules are category based.
#
# energy_source_id is intentionally NOT required.
#
# This prevents the system from creating different fares
# merely because a vehicle uses petrol, diesel, LPG or EV.
# ============================================================

def find_fare_rule(
    category_id: int,
    seating_capacity: Optional[int] = None,
):

    query = """
        SELECT
            fr.*
        FROM fare_rules fr
        WHERE fr.category_id = %s
          AND fr.status = 'active'
          AND fr.effective_from <= CURRENT_DATE
          AND (
                fr.effective_to IS NULL
                OR fr.effective_to >= CURRENT_DATE
              )
        ORDER BY
            fr.effective_from DESC,
            fr.id DESC
        LIMIT 1
    """

    try:

        return fetch_one(
            query,
            (category_id,),
        )

    except Exception as exc:

        print(
            "Fare rule lookup error:",
            exc,
        )

        return None


# ============================================================
# FARE SLABS
# ============================================================

def find_fare_slabs(
    fare_rule_id: int,
):

    query = """
        SELECT
            id,
            fare_rule_id,
            from_km,
            to_km,
            rate_per_km,
            created_at
        FROM fare_slabs
        WHERE fare_rule_id = %s
        ORDER BY
            COALESCE(from_km, 0),
            id
    """

    try:

        return fetch_all(
            query,
            (fare_rule_id,),
        )

    except Exception as exc:

        print(
            "Fare slab lookup error:",
            exc,
        )

        return []


# ============================================================
# SLAB CALCULATION
# ============================================================

def calculate_from_slabs(
    distance_km: float,
    minimum_fare: float,
    minimum_distance_km: float,
    slabs,
):

    minimum_fare = float(
        minimum_fare
    )

    minimum_distance_km = float(
        minimum_distance_km
    )

    # --------------------------------------------------------
    # Within minimum distance
    # --------------------------------------------------------

    if distance_km <= minimum_distance_km:

        return {
            "fare": minimum_fare,
            "base_fare": minimum_fare,
            "additional_fare": 0.0,
            "additional_distance_km": 0.0,
            "slab_breakdown": [],
        }

    # --------------------------------------------------------
    # No slabs
    # --------------------------------------------------------

    if not slabs:

        return {
            "fare": minimum_fare,
            "base_fare": minimum_fare,
            "additional_fare": 0.0,
            "additional_distance_km":
                distance_km - minimum_distance_km,
            "slab_breakdown": [],
        }

    total = minimum_fare
    additional_fare = 0.0
    slab_breakdown = []

    for slab in slabs:

        from_km = (
            float(slab["from_km"])
            if slab["from_km"] is not None
            else minimum_distance_km
        )

        to_km = (
            float(slab["to_km"])
            if slab["to_km"] is not None
            else None
        )

        rate = float(
            slab["rate_per_km"]
        )

        if distance_km <= from_km:
            continue

        slab_start = max(
            from_km,
            minimum_distance_km,
        )

        if to_km is None:

            slab_end = distance_km

        else:

            slab_end = min(
                distance_km,
                to_km,
            )

        slab_distance = max(
            0.0,
            slab_end - slab_start,
        )

        if slab_distance <= 0:
            continue

        slab_amount = (
            slab_distance * rate
        )

        additional_fare += slab_amount
        total += slab_amount

        slab_breakdown.append({
            "from_km":
                money(slab_start),

            "to_km":
                money(slab_end),

            "distance_km":
                money(slab_distance),

            "rate_per_km":
                money(rate),

            "amount":
                money(slab_amount),
        })

    return {
        "fare": total,
        "base_fare": minimum_fare,
        "additional_fare": additional_fare,
        "additional_distance_km":
            max(
                0.0,
                distance_km - minimum_distance_km,
            ),
        "slab_breakdown":
            slab_breakdown,
    }


# ============================================================
# FALLBACK FARES
# ============================================================
#
# Emergency fallback only.
#
# These are NOT claimed to be current government fares.
#
# Database fare rules should always be preferred.
# ============================================================

FALLBACK_FARES = {

    "Auto Rickshaw": {
        "minimum_fare": 30.0,
        "minimum_distance": 1.5,
        "rate": 15.0,
    },

    "Quadricycle": {
        "minimum_fare": 30.0,
        "minimum_distance": 1.5,
        "rate": 15.0,
    },

    "Motor Cab": {
        "minimum_fare": 200.0,
        "minimum_distance": 5.0,
        "rate": 18.0,
    },

    "Maxicab": {
        "minimum_fare": 200.0,
        "minimum_distance": 5.0,
        "rate": 20.0,
    },

    "Contract Carriage": {
        "minimum_fare": 200.0,
        "minimum_distance": 5.0,
        "rate": 20.0,
    },

    "Stage Carriage": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Ordinary / Mofussil": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "City Fast": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Fast Passenger": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Super Fast": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Express": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Super Express": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Super Deluxe": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Luxury / AC": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Single Axle": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Multi Axle": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },

    "Low Floor": {
        "minimum_fare": 20.0,
        "minimum_distance": 1.0,
        "rate": 10.0,
    },
}


def fallback_fare(
    category: str,
    distance_km: float,
):

    config = FALLBACK_FARES.get(
        category,
        FALLBACK_FARES["Stage Carriage"],
    )

    minimum_fare = config["minimum_fare"]
    minimum_distance = config["minimum_distance"]
    rate = config["rate"]

    if distance_km <= minimum_distance:

        fare = minimum_fare

    else:

        fare = (
            minimum_fare
            +
            (
                distance_km
                - minimum_distance
            )
            * rate
        )

    return {
        "fare": fare,
        "base_fare": minimum_fare,
        "additional_fare":
            max(
                0.0,
                fare - minimum_fare,
            ),
        "additional_distance_km":
            max(
                0.0,
                distance_km - minimum_distance,
            ),
        "rate_per_km": rate,
    }


# ============================================================
# MAIN FARE CALCULATION
# ============================================================

@app.post("/api/fare/calculate")
def calculate_fare(
    request: FareCalculationRequest,
):

    # --------------------------------------------------------
    # 1. CATEGORY
    # --------------------------------------------------------

    category = find_category(
        request.category
    )

    if not category:

        raise HTTPException(
            status_code=404,
            detail={
                "message":
                    "Vehicle/fare category not found",

                "requested":
                    request.category,

                "normalized":
                    normalize_name(
                        request.category
                    ),
            },
        )

    category_id = category["id"]

    # --------------------------------------------------------
    # 2. VEHICLE
    # --------------------------------------------------------
    #
    # Vehicle is optional.
    #
    # It is NOT necessary for normal fare calculation.
    # --------------------------------------------------------

    vehicle = find_vehicle(
        category_id=category_id,
        seating_capacity=
            request.seating_capacity,
        vehicle_id=request.vehicle_id,
    )

    # --------------------------------------------------------
    # 3. FARE RULE
    # --------------------------------------------------------

    fare_rule = find_fare_rule(
        category_id=category_id,
        seating_capacity=
            request.seating_capacity,
    )

    # --------------------------------------------------------
    # 4. DATABASE FARE
    # --------------------------------------------------------

    if fare_rule:

        minimum_fare = float(
            fare_rule["minimum_fare"]
        )

        minimum_distance = float(
            fare_rule["minimum_distance_km"]
        )

        slabs = find_fare_slabs(
            fare_rule["id"]
        )

        result = calculate_from_slabs(
            distance_km=request.distance_km,
            minimum_fare=minimum_fare,
            minimum_distance_km=
                minimum_distance,
            slabs=slabs,
        )

        return {
            "success": True,

            "calculation": {

                "category":
                    category["name"],

                "distance_km":
                    request.distance_km,

                "seating_capacity":
                    request.seating_capacity,

                "vehicle":
                    vehicle,

                # Fuel is informational only.
                "common_fuel":
                    common_fuel_for_category(
                        category["name"]
                    ),

                "fare":
                    money(
                        result["fare"]
                    ),

                "currency":
                    "INR",

                "calculation_method":
                    "database_fare_rule",

                "fare_rule_id":
                    fare_rule["id"],

                "government_reference":
                    fare_rule.get(
                        "government_reference"
                    ),

                "minimum_fare":
                    money(
                        minimum_fare
                    ),

                "minimum_distance_km":
                    money(
                        minimum_distance
                    ),

                "additional_distance_km":
                    money(
                        result[
                            "additional_distance_km"
                        ]
                    ),

                "additional_fare":
                    money(
                        result[
                            "additional_fare"
                        ]
                    ),

                "slab_breakdown":
                    result[
                        "slab_breakdown"
                    ],

                "fare_source":
                    "database",
            },
        }

    # --------------------------------------------------------
    # 5. FALLBACK
    # --------------------------------------------------------

    fallback = fallback_fare(
        category=category["name"],
        distance_km=request.distance_km,
    )

    return {
        "success": True,

        "calculation": {

            "category":
                category["name"],

            "distance_km":
                request.distance_km,

            "seating_capacity":
                request.seating_capacity,

            "vehicle":
                vehicle,

            "common_fuel":
                common_fuel_for_category(
                    category["name"]
                ),

            "fare":
                money(
                    fallback["fare"]
                ),

            "currency":
                "INR",

            "calculation_method":
                "fallback_estimate",

            "fare_rule_id":
                None,

            "minimum_fare":
                money(
                    fallback["base_fare"]
                ),

            "additional_distance_km":
                money(
                    fallback[
                        "additional_distance_km"
                    ]
                ),

            "additional_fare":
                money(
                    fallback[
                        "additional_fare"
                    ]
                ),

            "rate_per_km":
                money(
                    fallback[
                        "rate_per_km"
                    ]
                ),

            "fare_source":
                "fallback_estimate",

            "warning":
                (
                    "No active government fare rule "
                    "was found in the database. "
                    "This is only an estimate and "
                    "must not be treated as an official fare."
                ),
        },
    }


# ============================================================
# FARE TEST
# ============================================================

@app.get("/api/fare/test")
def fare_test(
    category: str = "Auto Rickshaw",
    distance_km: float = 10.0,
):

    request = FareCalculationRequest(
        category=category,
        distance_km=distance_km,
    )

    return calculate_fare(request)


# ============================================================
# DATABASE FARE RULES
# ============================================================

@app.get("/api/fare-rules")
def get_fare_rules(
    category: Optional[str] = None,
):

    query = """
        SELECT
            fr.id,
            fr.category_id,
            vc.name AS category,
            fr.minimum_fare,
            fr.minimum_distance_km,
            fr.effective_from,
            fr.effective_to,
            fr.source_id,
            fr.government_reference,
            fr.status,
            fr.notes,
            fr.created_at
        FROM fare_rules fr
        INNER JOIN vehicle_categories vc
            ON vc.id = fr.category_id
        WHERE 1 = 1
    """

    params = []

    if category:

        canonical = canonical_category_name(
            category
        )

        query += """
            AND LOWER(TRIM(vc.name))
                = LOWER(TRIM(%s))
        """

        params.append(canonical)

    query += """
        ORDER BY
            fr.category_id,
            fr.effective_from DESC,
            fr.id DESC
    """

    try:

        rows = fetch_all(
            query,
            params,
        )

        return {
            "success": True,
            "count": len(rows),
            "fare_rules": rows,
        }

    except Exception as exc:

        print(
            "Fare rules error:",
            exc,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to load fare rules",
        )


# ============================================================
# SINGLE FARE RULE
# ============================================================

@app.get("/api/fare-rules/{fare_rule_id}")
def get_fare_rule(
    fare_rule_id: int,
):

    query = """
        SELECT
            fr.id,
            fr.category_id,
            vc.name AS category,
            fr.minimum_fare,
            fr.minimum_distance_km,
            fr.effective_from,
            fr.effective_to,
            fr.source_id,
            fr.government_reference,
            fr.status,
            fr.notes,
            fr.created_at
        FROM fare_rules fr
        INNER JOIN vehicle_categories vc
            ON vc.id = fr.category_id
        WHERE fr.id = %s
        LIMIT 1
    """

    rule = fetch_one(
        query,
        (fare_rule_id,),
    )

    if not rule:

        raise HTTPException(
            status_code=404,
            detail="Fare rule not found",
        )

    slabs = find_fare_slabs(
        fare_rule_id
    )

    return {
        "success": True,
        "fare_rule": rule,
        "slabs": slabs,
    }


# ============================================================
# DEBUG DATABASE
# ============================================================

@app.get("/api/debug/database")
def debug_database():

    tables = {}

    table_names = [
        "vehicle_categories",
        "energy_sources",
        "vehicles",
        "fare_rules",
        "fare_slabs",
        "cost_categories",
        "data_sources",
        "cost_data",
        "price_history",
        "cost_index_history",
    ]

    conn = get_connection()

    try:

        with conn.cursor() as cursor:

            for table in table_names:

                try:

                    cursor.execute(
                        f"""
                        SELECT COUNT(*) AS count
                        FROM {table}
                        """
                    )

                    row = cursor.fetchone()

                    tables[table] = row["count"]

                except Exception as exc:

                    print(
                        f"Table {table} error:",
                        exc,
                    )

                    tables[table] = 0

        return {
            "success": True,
            "tables": tables,
        }

    finally:

        conn.close()


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
def startup_event():

    print(
        "============================================================"
    )

    print(
        "Fare Keralam API starting..."
    )

    print(
        "Database configured:",
        bool(DATABASE_URL),
    )

    print(
        "Fare calculation:",
        "CATEGORY BASED",
    )

    print(
        "Fuel selection:",
        "DISABLED",
    )

    print(
        "EV-specific fare:",
        "DISABLED",
    )

    print(
        "Hybrid-specific fare:",
        "DISABLED",
    )

    print(
        "============================================================"
    )


# ============================================================
# LOCAL DEVELOPMENT
# ============================================================

if __name__ == "__main__":

    import uvicorn

    port = int(
        os.getenv(
            "PORT",
            "8000",
        )
    )

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )