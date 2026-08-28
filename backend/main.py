# ============================================================
# FARE KERALAM - MAIN API
# Production-ready version
# ============================================================
#
# Kerala passenger transport fare calculation API.
#
# DESIGN PRINCIPLES
# -----------------
# 1. Fare category is the primary determinant of passenger fare.
# 2. Fuel is NOT selected by the passenger.
# 3. Petrol / Diesel / EV does NOT automatically create a
#    different passenger fare.
# 4. Fuel information is retained internally for cost analysis.
# 5. Government/database fare rules are preferred.
# 6. Fallback fares are estimates only.
# 7. Database remains the source of truth for categories and
#    fare rules.
# 8. Existing API endpoints and frontend response fields are
#    preserved for compatibility.
#
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
from pydantic import BaseModel, Field


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("WARNING: DATABASE_URL is not configured")


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="Fare Keralam API",
    description=(
        "Kerala passenger transport fare calculation API "
        "using government fare categories and database-backed "
        "fare rules."
    ),
    version="2.2.0",
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
    """
    Create a PostgreSQL database connection.

    Supabase/PostgreSQL URLs may contain SSL requirements,
    which are respected directly by psycopg2.
    """

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

    except psycopg2.Error as exc:
        print("Database connection error:", exc)

        raise HTTPException(
            status_code=503,
            detail="Unable to connect to database",
        )


def fetch_one(query: str, params=()):
    """
    Execute a SELECT query and return one row.
    """

    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()

    except psycopg2.Error as exc:
        print("Database query error:", exc)

        raise HTTPException(
            status_code=500,
            detail="Database query failed",
        )

    finally:
        conn.close()


def fetch_all(query: str, params=()):
    """
    Execute a SELECT query and return all rows.
    """

    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall()

    except psycopg2.Error as exc:
        print("Database query error:", exc)

        raise HTTPException(
            status_code=500,
            detail="Database query failed",
        )

    finally:
        conn.close()


# ============================================================
# MONEY
# ============================================================

def money(value: Any) -> float:
    """
    Convert a numeric value to INR-compatible two-decimal float.
    """

    try:
        amount = Decimal(str(value))

        return float(
            amount.quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )
        )

    except (InvalidOperation, ValueError, TypeError) as exc:
        print("Money conversion error:", exc)
        return 0.0


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_name(value: Optional[str]) -> str:
    """
    Normalize names for reliable comparison.
    """

    if value is None:
        return ""

    value = str(value).strip().lower()

    replacements = {
        "/": " ",
        "-": " ",
        "_": " ",
        ".": " ",
    }

    for old, new in replacements.items():
        value = value.replace(old, new)

    return " ".join(value.split())


# ============================================================
# CATEGORY ALIASES
# ============================================================

CATEGORY_ALIASES = {
    "auto": "Auto Rickshaw",
    "auto rickshaw": "Auto Rickshaw",

    "taxi": "Motor Cab",
    "motor cab": "Motor Cab",
    "taxi motor cab": "Motor Cab",

    "maxicab": "Maxicab",
    "maxi cab": "Maxicab",

    "contract carriage": "Contract Carriage",
    "traveller": "Contract Carriage",
    "traveler": "Contract Carriage",
    "tourist vehicle": "Contract Carriage",
    "tourist bus": "Contract Carriage",

    "stage carriage": "Stage Carriage",
}


def canonical_category_name(
    category: Optional[str],
) -> Optional[str]:
    """
    Convert user input into the canonical database category.
    """

    if not category:
        return None

    normalized = normalize_name(category)

    return CATEGORY_ALIASES.get(
        normalized,
        category.strip(),
    )


# ============================================================
# COMMON FUEL INFORMATION
# ============================================================

COMMON_FUEL_BY_CATEGORY = {
    "Auto Rickshaw": "Diesel",
    "Motor Cab": "Petrol",
    "Maxicab": "Diesel",
    "Contract Carriage": "Diesel",
    "Stage Carriage": "Diesel",
}


def common_fuel_for_category(
    category: str,
) -> Optional[str]:
    """
    Informational fuel association only.

    This does NOT determine passenger fare.
    """

    return COMMON_FUEL_BY_CATEGORY.get(category)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "success": True,
        "name": "Fare Keralam API",
        "version": "2.2.0",
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

        conn = None

        try:
            conn = get_connection()

            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()

            database_connected = True

        except HTTPException:
            database_connected = False

        except Exception as exc:
            print("Health database error:", exc)

        finally:
            if conn:
                conn.close()

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

    except HTTPException:
        raise

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

    if not canonical:
        return None

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

@app.get("/api/vehicles")
def get_vehicles(
    category: Optional[str] = None,
    seating_capacity: Optional[int] = Query(
        None,
        gt=0,
    ),
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
                WHERE active = TRUE
                  AND LOWER(TRIM(name))
                      = LOWER(TRIM(%s))
                LIMIT 1
            )
        """

        params.append(canonical)

    if seating_capacity is not None:

        query += """
            AND v.seating_capacity = %s
        """

        params.append(seating_capacity)

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

    except HTTPException:
        raise

    except Exception as exc:

        print("Vehicles error:", exc)

        raise HTTPException(
            status_code=500,
            detail="Unable to load vehicles",
        )


# ============================================================
# VEHICLE OPTIONS
# ============================================================

@app.get("/api/vehicle-options")
def get_vehicle_options():

    query = """
        SELECT
            vc.id,
            vc.name AS category,
            vc.description,
            vc.requires_model,
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
                "requires_model": bool(
                    row["requires_model"]
                ),
                "requires_seating_capacity": bool(
                    row["requires_seating_capacity"]
                ),
            })

        return {
            "success": True,
            "categories": categories,
        }

    except HTTPException:
        raise

    except Exception as exc:

        print("Vehicle options error:", exc)

        raise HTTPException(
            status_code=500,
            detail="Unable to load vehicle options",
        )


# ============================================================
# CATEGORY REQUIREMENT VALIDATION
# ============================================================

def validate_category_requirements(
    category,
    seating_capacity: Optional[int],
):
    """
    Validate requirements stored in the database.

    Database values are treated as the source of truth.
    """

    category_name = category["name"]

    requires_seating = bool(
        category["requires_seating_capacity"]
    )

    if requires_seating:

        if seating_capacity is None:

            raise HTTPException(
                status_code=400,
                detail={
                    "message": (
                        "Seating capacity is required "
                        "for this vehicle category"
                    ),
                    "category": category_name,
                },
            )


# ============================================================
# FIND VEHICLE
# ============================================================

def find_vehicle(
    category_id: int,
    seating_capacity: Optional[int] = None,
    vehicle_id: Optional[int] = None,
):
    """
    Find an internal vehicle record.

    Vehicle/fuel selection is not required for ordinary
    passenger fare calculation.
    """

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

            raise HTTPException(
                status_code=404,
                detail="Selected vehicle not found",
            )

        if vehicle["category_id"] != category_id:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Selected vehicle does not belong "
                    "to the selected category"
                ),
            )

        return vehicle

    # --------------------------------------------------------
    # Seating-specific vehicle
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

        vehicle = fetch_one(
            query,
            (
                category_id,
                seating_capacity,
            ),
        )

        return vehicle

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
        description=(
            "Required only for categories that require "
            "seating capacity"
        ),
    )

    vehicle_id: Optional[int] = Field(
        None,
        gt=0,
        description="Optional internal vehicle reference",
    )


# ============================================================
# INPUT VALIDATION
# ============================================================

def validate_distance(
    distance_km: float,
):
    """
    Protect calculation logic against NaN/Infinity.
    """

    if not math.isfinite(distance_km):

        raise HTTPException(
            status_code=400,
            detail="Distance must be a finite number",
        )

    if distance_km <= 0:

        raise HTTPException(
            status_code=400,
            detail="Distance must be greater than zero",
        )

    # Prevent accidental extreme values from being sent
    # to the calculation engine.
    if distance_km > 10000:

        raise HTTPException(
            status_code=400,
            detail="Distance is unrealistically large",
        )


# ============================================================
# FIND FARE RULE
# ============================================================

def find_fare_rule(
    category_id: int,
    seating_capacity: Optional[int] = None,
):
    """
    Find the currently active category fare rule.

    Seating capacity is intentionally retained as a parameter
    for future category-specific rule tables, but current
    fare_rules remain category based.

    Fuel is never part of passenger fare lookup.
    """

    query = """
        SELECT
            fr.*
        FROM fare_rules fr
        WHERE fr.category_id = %s
          AND LOWER(TRIM(fr.status)) = 'active'
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

    except HTTPException:
        raise

    except Exception as exc:

        print("Fare rule lookup error:", exc)

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

    except HTTPException:
        raise

    except Exception as exc:

        print("Fare slab lookup error:", exc)

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
    """
    Calculate fare using database fare slabs.

    The minimum fare covers the minimum distance.

    Only the portion beyond the minimum distance is charged
    through slabs.
    """

    validate_distance(distance_km)

    minimum_fare = float(minimum_fare)
    minimum_distance_km = float(minimum_distance_km)

    if minimum_fare < 0:
        raise ValueError("Minimum fare cannot be negative")

    if minimum_distance_km < 0:
        raise ValueError(
            "Minimum distance cannot be negative"
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
            "additional_distance_km": (
                distance_km - minimum_distance_km
            ),
            "slab_breakdown": [],
        }

    total = minimum_fare
    additional_fare = 0.0
    slab_breakdown = []

    covered_until = minimum_distance_km

    # --------------------------------------------------------
    # Process slabs in database order
    # --------------------------------------------------------

    for slab in slabs:

        try:

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

        except (TypeError, ValueError) as exc:

            print(
                "Invalid fare slab skipped:",
                exc,
            )

            continue

        # Invalid slab
        if from_km < 0:
            continue

        if to_km is not None and to_km <= from_km:
            continue

        if rate < 0:
            continue

        # Slab must begin after the minimum-distance boundary.
        slab_start = max(
            from_km,
            minimum_distance_km,
            covered_until,
        )

        if to_km is None:

            slab_end = distance_km

        else:

            slab_end = min(
                distance_km,
                to_km,
            )

        if slab_end <= slab_start:
            continue

        slab_distance = slab_end - slab_start

        slab_amount = (
            slab_distance * rate
        )

        additional_fare += slab_amount
        total += slab_amount

        covered_until = max(
            covered_until,
            slab_end,
        )

        slab_breakdown.append({
            "from_km": money(
                slab_start
            ),
            "to_km": money(
                slab_end
            ),
            "distance_km": money(
                slab_distance
            ),
            "rate_per_km": money(
                rate
            ),
            "amount": money(
                slab_amount
            ),
        })

        if covered_until >= distance_km:
            break

    # --------------------------------------------------------
    # Detect uncovered distance
    # --------------------------------------------------------

    additional_distance = max(
        0.0,
        distance_km - minimum_distance_km,
    )

    return {
        "fare": total,
        "base_fare": minimum_fare,
        "additional_fare": additional_fare,
        "additional_distance_km": additional_distance,
        "slab_breakdown": slab_breakdown,
    }


# ============================================================
# FALLBACK FARES
# ============================================================
#
# Emergency estimates only.
#
# These values must NEVER be represented as official
# government fares.
#
# ============================================================

FALLBACK_FARES = {

    "Auto Rickshaw": {
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
}


def fallback_fare(
    category: str,
    distance_km: float,
):

    validate_distance(distance_km)

    config = FALLBACK_FARES.get(
        category
    )

    if not config:

        raise HTTPException(
            status_code=500,
            detail=(
                "No fallback fare configuration "
                "exists for this category"
            ),
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

        "additional_fare": max(
            0.0,
            fare - minimum_fare,
        ),

        "additional_distance_km": max(
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
    # 0. Validate distance
    # --------------------------------------------------------

    validate_distance(
        request.distance_km
    )

    # --------------------------------------------------------
    # 1. FIND CATEGORY
    # --------------------------------------------------------

    category = find_category(
        request.category
    )

    if not category:

        raise HTTPException(
            status_code=404,
            detail={
                "message": (
                    "Vehicle/fare category not found"
                ),
                "requested": request.category,
                "normalized": normalize_name(
                    request.category
                ),
            },
        )

    category_id = category["id"]
    category_name = category["name"]

    # --------------------------------------------------------
    # 2. VALIDATE CATEGORY REQUIREMENTS
    # --------------------------------------------------------

    validate_category_requirements(
        category=category,
        seating_capacity=request.seating_capacity,
    )

    # --------------------------------------------------------
    # 3. FIND INTERNAL VEHICLE
    # --------------------------------------------------------

    vehicle = find_vehicle(
        category_id=category_id,
        seating_capacity=request.seating_capacity,
        vehicle_id=request.vehicle_id,
    )

    # If a seating-specific category has a supplied capacity
    # but there is no matching vehicle record, do not fail the
    # entire fare calculation because fare rules are category
    # based. The vehicle field remains null.
    #
    # This preserves frontend compatibility.

    # --------------------------------------------------------
    # 4. FIND ACTIVE DATABASE FARE RULE
    # --------------------------------------------------------

    fare_rule = find_fare_rule(
        category_id=category_id,
        seating_capacity=request.seating_capacity,
    )

    # ========================================================
    # 5. DATABASE FARE
    # ========================================================

    if fare_rule:

        try:

            minimum_fare = float(
                fare_rule["minimum_fare"]
            )

            minimum_distance = float(
                fare_rule["minimum_distance_km"]
            )

        except (TypeError, ValueError) as exc:

            print(
                "Invalid fare rule values:",
                exc,
            )

            fare_rule = None

        else:

            slabs = find_fare_slabs(
                fare_rule["id"]
            )

            try:

                result = calculate_from_slabs(
                    distance_km=request.distance_km,
                    minimum_fare=minimum_fare,
                    minimum_distance_km=minimum_distance,
                    slabs=slabs,
                )

            except (ValueError, TypeError) as exc:

                print(
                    "Fare calculation error:",
                    exc,
                )

                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Invalid fare rule configuration"
                    ),
                )

            return {
                "success": True,

                "calculation": {

                    "category": category_name,

                    "distance_km": money(
                        request.distance_km
                    ),

                    "seating_capacity": (
                        request.seating_capacity
                    ),

                    "vehicle": vehicle,

                    "common_fuel": (
                        common_fuel_for_category(
                            category_name
                        )
                    ),

                    "fare": money(
                        result["fare"]
                    ),

                    "currency": "INR",

                    "calculation_method": (
                        "database_fare_rule"
                    ),

                    "fare_rule_id": (
                        fare_rule["id"]
                    ),

                    "government_reference": (
                        fare_rule.get(
                            "government_reference"
                        )
                    ),

                    "minimum_fare": money(
                        minimum_fare
                    ),

                    "minimum_distance_km": money(
                        minimum_distance
                    ),

                    "additional_distance_km": money(
                        result[
                            "additional_distance_km"
                        ]
                    ),

                    "additional_fare": money(
                        result[
                            "additional_fare"
                        ]
                    ),

                    "slab_breakdown": (
                        result[
                            "slab_breakdown"
                        ]
                    ),

                    "fare_source": "database",
                },
            }

    # ========================================================
    # 6. FALLBACK ESTIMATE
    # ========================================================

    fallback = fallback_fare(
        category=category_name,
        distance_km=request.distance_km,
    )

    fallback_config = FALLBACK_FARES[
        category_name
    ]

    return {
        "success": True,

        "calculation": {

            "category": category_name,

            "distance_km": money(
                request.distance_km
            ),

            "seating_capacity": (
                request.seating_capacity
            ),

            "vehicle": vehicle,

            "common_fuel": (
                common_fuel_for_category(
                    category_name
                )
            ),

            "fare": money(
                fallback["fare"]
            ),

            "currency": "INR",

            "calculation_method": (
                "fallback_estimate"
            ),

            "fare_rule_id": None,

            "minimum_fare": money(
                fallback["base_fare"]
            ),

            "minimum_distance_km": money(
                fallback_config[
                    "minimum_distance"
                ]
            ),

            "additional_distance_km": money(
                fallback[
                    "additional_distance_km"
                ]
            ),

            "additional_fare": money(
                fallback[
                    "additional_fare"
                ]
            ),

            "rate_per_km": money(
                fallback[
                    "rate_per_km"
                ]
            ),

            "fare_source": (
                "fallback_estimate"
            ),

            "warning": (
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

    return calculate_fare(
        request
    )


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

        params.append(
            canonical
        )

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

    except HTTPException:
        raise

    except Exception as exc:

        print("Fare rules error:", exc)

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

    # Static internal table names only.
    # These values are NOT user-controlled.
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

                except psycopg2.Error as exc:

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
        "Vehicle model selection:",
        "DISABLED",
    )

    print(
        "Seating capacity:",
        "DATABASE CONTROLLED",
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
