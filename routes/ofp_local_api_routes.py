"""Local /api/ofp — same-origin physical body for the OpenFieldPro modal.

Self-contained FastAPI endpoints that mirror the SAMPLE_DATA shape baked into
static/js/openfieldpro.js. Removed the localhost:4000 dependency from the modal
(client now hits /api/ofp/* on the same origin), so OFP keeps working when the
external Phase-1 podman project is down.Endpoints mirror what openfieldpro.js already calls:
  GET  /api/ofp/health            -> {status: "ok"}
  POST /api/ofp/auth/login        -> {token, user}        (any email+pwd accepted)
  GET  /api/ofp/{jobs,customers,services,estimates,invoices,team}[+ POSTs]
       POST/PUT/DELETE on /jobs, /customers, /inventory, /invoices
       409 on POST when body.id collides with an existing row (id-conflict defense)

Persistence: _STORE is loaded from .ofp-store.json at module import (atomic
write to .tmp + os.replace on every POST). File lives at the project root
(one level above routes/).

ponytail: no file lock. Ceiling: multi-worker uvicorn would race on writes.
Upgrade: add fcntl/msvcrt flock or move to sqlite for proper transactions.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

# Seed data — verbatim shape from static/js/openfieldpro.js SAMPLE_DATA so the
# existing render functions don't need to change.
_SEED: Dict[str, List[Dict[str, Any]]] = {
    "customers": [
        {"id": "c1", "name": "Priya Chandrasekar", "email": "priya.ch@example.com",
         "phone": "(555) 232-1100", "address": "12 Maple Court", "city": "Eugene",
         "state": "OR", "zip": "97401", "created_at": "2026-02-03"},
        {"id": "c2", "name": "Tomasz Wojcik", "email": "t.wojcik@example.com",
         "phone": "(555) 232-1200", "address": "88 Riverbend Rd", "city": "Eugene",
         "state": "OR", "zip": "97402", "created_at": "2026-03-11"},
        {"id": "c3", "name": "Anika Robinson", "email": "anika.r@example.com",
         "phone": "(555) 232-1300", "address": "105 Cedar Ave", "city": "Eugene",
         "state": "OR", "zip": "97403", "created_at": "2026-01-29"},
        {"id": "c4", "name": "Diego Salazar", "email": "d.salazar@example.com",
         "phone": "(555) 232-1400", "address": "7 Glenview Way", "city": "Eugene",
         "state": "OR", "zip": "97405", "created_at": "2026-04-02"},
        {"id": "c5", "name": "Yuki Tanaka", "email": "y.tanaka@example.com",
         "phone": "(555) 232-1500", "address": "213 Walnut St", "city": "Eugene",
         "state": "OR", "zip": "97401", "created_at": "2026-03-22"},
        {"id": "c6", "name": "Renée Lavalle", "email": "r.lavalle@example.com",
         "phone": "(555) 232-1600", "address": "940 Oak Ridge Dr", "city": "Eugene",
         "state": "OR", "zip": "97408", "created_at": "2026-05-15"},
        {"id": "c7", "name": "Hassan Almasi", "email": "h.almasi@example.com",
         "phone": "(555) 232-1700", "address": "31 Birch St", "city": "Springfield",
         "state": "OR", "zip": "97477", "created_at": "2026-02-19"},
    ],
    "services": [
        {"id": "s1", "name": "Standard HVAC Tune-Up",  "duration_min": 60,  "price": 129.00},
        {"id": "s2", "name": "Emergency Plumbing Call", "duration_min": 90,  "price": 219.00},
        {"id": "s3", "name": "Drain Cleaning",         "duration_min": 45,  "price":  99.00},
        {"id": "s4", "name": "AC Install (per ton)",   "duration_min": 240, "price": 1450.00},
        {"id": "s5", "name": "Water Heater Replace",   "duration_min": 180, "price": 1280.00},
    ],
    # Inventory catalog — physical SKUs the techs carry. Separate from
    # `services` which is time-based labor (no inventory to bill against).
    # Line items on invoices snapshot {name, default_price, taxable} at
    # add-time so renaming a catalog item later doesn't rewrite history.
    "inventory_items": [
        {"id": "inv-filt1625", "name": "HVAC Filter 16x25x1",     "category": "filter",
         "default_price": 24.99, "unit": "each", "taxable": True,
         "sku": "FILT-1625", "description": "Pleated air filter, MERV 8",
         "created_at": "2026-05-01"},
        {"id": "inv-filt2025", "name": "HVAC Filter 20x25x1",     "category": "filter",
         "default_price": 29.99, "unit": "each", "taxable": True,
         "sku": "FILT-2025", "description": "Pleated air filter, MERV 11",
         "created_at": "2026-05-01"},
        {"id": "inv-cap455",   "name": "Dual Capacitor 45/5 µF",  "category": "part",
         "default_price": 34.99, "unit": "each", "taxable": True,
         "sku": "CAP-455",   "description": "Dual run capacitor for AC condenser",
         "created_at": "2026-04-15"},
        {"id": "inv-refr410",  "name": "Refrigerant R-410A",      "category": "refrigerant",
         "default_price": 18.50, "unit": "lb",   "taxable": True,
         "sku": "REFR-410",  "description": "R-410A refrigerant, per pound",
         "created_at": "2026-04-20"},
        {"id": "inv-refr134",  "name": "Refrigerant R-134a",      "category": "refrigerant",
         "default_price": 14.00, "unit": "lb",   "taxable": True,
         "sku": "REFR-134",  "description": "R-134a refrigerant, per pound",
         "created_at": "2026-04-20"},
        {"id": "inv-labdiag",  "name": "Diagnostic Labor",        "category": "labor",
         "default_price":  89.00, "unit": "hour", "taxable": False,
         "sku": "LAB-DIAG",  "description": "Standard diagnostic labor rate",
         "created_at": "2026-05-10"},
    ],
    "jobs": [
        {"id": "j01", "title": "AC Tune-Up",          "customer_id": "c1", "service_id": "s1",
         "status": "scheduled",  "scheduled_at": "2026-06-26T09:00:00", "assignee": "Jordan K.",
         "address": "12 Maple Court, Eugene", "notes": "Customer prefers 9am window.", "price": 129},
        {"id": "j02", "title": "Drain Cleaning",      "customer_id": "c2", "service_id": "s3",
         "status": "inprogress", "scheduled_at": "2026-06-26T10:30:00", "assignee": "Marisol P.",
         "address": "88 Riverbend Rd, Eugene", "notes": "", "price": 99},
        {"id": "j03", "title": "Water Heater Replace", "customer_id": "c3", "service_id": "s5",
         "status": "dispatched", "scheduled_at": "2026-06-26T13:00:00", "assignee": "Devin W.",
         "address": "105 Cedar Ave, Eugene", "notes": "Old unit 12gal — verify gas line.", "price": 1280},
        {"id": "j04", "title": "Emergency Leak",       "customer_id": "c4", "service_id": "s2",
         "status": "new",        "scheduled_at": None, "assignee": None,
         "address": "7 Glenview Way, Eugene", "notes": "Customer reported water under sink.", "price": 219},
        {"id": "j05", "title": "Furnace Inspection",   "customer_id": "c5", "service_id": "s1",
         "status": "scheduled",  "scheduled_at": "2026-06-27T08:00:00", "assignee": "Jordan K.",
         "address": "213 Walnut St, Eugene", "notes": "", "price": 129},
        {"id": "j06", "title": "AC Install",           "customer_id": "c6", "service_id": "s4",
         "status": "completed",  "scheduled_at": "2026-06-24T09:00:00", "assignee": "Devin W.",
         "address": "940 Oak Ridge Dr, Eugene", "notes": "3-ton unit. Paid in full.", "price": 4350},
        {"id": "j07", "title": "Water Heater Flush",   "customer_id": "c7", "service_id": "s1",
         "status": "completed",  "scheduled_at": "2026-06-25T14:00:00", "assignee": "Marisol P.",
         "address": "31 Birch St, Springfield", "notes": "", "price": 129},
        {"id": "j08", "title": "Drain Cleaning",       "customer_id": "c1", "service_id": "s3",
         "status": "scheduled",  "scheduled_at": "2026-06-28T11:00:00", "assignee": "Marisol P.",
         "address": "12 Maple Court, Eugene", "notes": "Recurring maintenance.", "price": 99},
        {"id": "j09", "title": "AC Tune-Up",           "customer_id": "c5", "service_id": "s1",
         "status": "onhold",     "scheduled_at": None, "assignee": None,
         "address": "213 Walnut St, Eugene", "notes": "Waiting on parts.", "price": 129},
        {"id": "j10", "title": "Emergency Plumbing",   "customer_id": "c2", "service_id": "s2",
         "status": "completed",  "scheduled_at": "2026-06-23T07:30:00", "assignee": "Devin W.",
         "address": "88 Riverbend Rd, Eugene", "notes": "Burst pipe under kitchen.", "price": 219},
    ],
    "estimates": [
        {"id": "e1", "customer_id": "c1", "title": "New AC System (3-ton)", "amount": 4850,
         "status": "sent",     "created_at": "2026-06-18", "expires_at": "2026-07-02"},
        {"id": "e2", "customer_id": "c4", "title": "Repipe Bathroom",        "amount": 1820,
         "status": "approved", "created_at": "2026-06-12", "expires_at": "2026-06-26"},
        {"id": "e3", "customer_id": "c5", "title": "Smart Thermostat Install", "amount": 420,
         "status": "draft",    "created_at": "2026-06-22", "expires_at": "2026-07-06"},
        {"id": "e4", "customer_id": "c6", "title": "Tankless Water Heater", "amount": 3650,
         "status": "sent",     "created_at": "2026-06-09", "expires_at": "2026-06-23"},
        {"id": "e5", "customer_id": "c7", "title": "Annual Maintenance Plan", "amount": 1290,
         "status": "declined", "created_at": "2026-05-30", "expires_at": "2026-06-13"},
    ],
    "invoices": [
        {"id": "i1", "customer_id": "c6", "job_id": "j06", "total": 4450, "balance": 0,
         "status": "paid",    "issued_at": "2026-06-23", "due_at": "2026-07-07"},
        {"id": "i2", "customer_id": "c7", "job_id": "j07", "total":  129, "balance": 0,
         "status": "paid",    "issued_at": "2026-06-25", "due_at": "2026-07-09"},
        {"id": "i3", "customer_id": "c2", "job_id": "j10", "total":  219, "balance": 0,
         "status": "paid",    "issued_at": "2026-06-22", "due_at": "2026-07-06"},
        {"id": "i4", "customer_id": "c1", "title": "Maintenance Q2", "total": 258,
         "balance": 258, "status": "sent",    "issued_at": "2026-06-24", "due_at": "2026-07-08"},
        {"id": "i5", "customer_id": "c3", "title": "Service Call",   "total": 180,
         "balance": 180, "status": "overdue", "issued_at": "2026-06-15", "due_at": "2026-06-29"},
    ],
    "team": [
        {"id": "t1", "name": "Jordan Kowalski", "role": "Technician",
         "email": "jordan.k@hometown.local", "active": True},
        {"id": "t2", "name": "Marisol Pereira",  "role": "Technician",
         "email": "marisol.p@hometown.local", "active": True},
        {"id": "t3", "name": "Devin Whittaker",  "role": "Lead Tech",
         "email": "devin.w@hometown.local",   "active": True},
        {"id": "t4", "name": "Marcus Rivera",    "role": "Owner",
         "email": "marcus@hometown.local",    "active": True},
        {"id": "t5", "name": "Tasha Ortiz",      "role": "Dispatcher",
         "email": "tasha.o@hometown.local",   "active": True},
    ],
}

# Persistence target — .ofp-store.json at the project root, one level above
# this routes/ directory. Atomic-ish: write to .tmp then os.replace(), so a
# crash mid-write can't tear the live file.
_STORE_PATH = Path(__file__).resolve().parent.parent / ".ofp-store.json"
_SCHEMA_VERSION = 1


def _load_store() -> Dict[str, List[Dict[str, Any]]]:
    """Boot _STORE from .ofp-store.json if present + well-formed; else fall back
    to a fresh copy of _SEED. Malformed store is treated as missing, so a
    botched write can't brick the OFP modal on the next boot.
    """
    if not _STORE_PATH.exists():
        return {key: [dict(row) for row in rows] for key, rows in _SEED.items()}
    try:
        payload = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
        if payload.get("version") != _SCHEMA_VERSION:
            return {key: [dict(row) for row in rows] for key, rows in _SEED.items()}
        collections = payload.get("collections") or {}
        # Merge: file takes precedence; any SEED key missing from the file is
        # backfilled from seed so a partial write still yields a complete store.
        # `collections.get(key, _SEED_fallback)` (NOT `or`) distinguishes
        # "key absent → seed" from "key present but legitimately empty list
        # → stay empty". Using `or` would reseed on every restart as soon as a
        # future DELETE emptied the collection (e.g. customers staged out).
        # ponytail: explicit per-key fallback. Ceiling: O(n) at boot; fine for
        # OFP volumes. Upgrade: if reseed-on-empty is ever a wanted feature,
        # make it opt-in via a per-collection `reseed_on_empty: true` flag.
        return {
            key: list(collections.get(key, [dict(row) for row in _SEED[key]]))
            for key in _SEED
        }
    except (json.JSONDecodeError, OSError):
        return {key: [dict(row) for row in rows] for key, rows in _SEED.items()}


def _save_store() -> None:
    """Atomic write of _STORE to .ofp-store.json so POSTs survive restart.

    ponytail: no file lock. Ceiling: two uvicorn workers racing on the same
    store would lose the last write. Upgrade: add fcntl/msvcrt flock, or move
    to sqlite for real cross-process transactions.
    """
    payload = {
        "version": _SCHEMA_VERSION,
        "saved_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "collections": {
            key: [dict(row) for row in rows] for key, rows in _STORE.items()
        },
    }
    tmp_path = _STORE_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    os.replace(tmp_path, _STORE_PATH)


# Process-local mutable store. Single source of truth for the lifetime of one
# uvicorn worker; cross-restart survival is handled by _load_store/_save_store.
_STORE: Dict[str, List[Dict[str, Any]]] = _load_store()


def _next_id(prefix: str) -> str:
    """UUID-backed allocator. 7 hex chars = ~268M permutations per prefix;
    birthday-paradox rule of thumb says first collision becomes plausible
    around sqrt(268M) ≈ 16K new ids on the same prefix — well above OFP's
    real-world per-session volume (10s to low 1000s).

    ponytail: 7 hex chars short. Ceiling: at ~16K+ ids per prefix a collision
    is statistically likely. Upgrade: switch to full `uuid.uuid4().hex`
    (32 chars, no realistic collision) if volume ever warrants it. Replaces
    the old startswith-count allocator that would have skipped id collisions
    once the count exceeded the prefix's digit-width.
    """
    return f"{prefix}-{uuid.uuid4().hex[:7]}"


def _upsert(collection: str, row_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    """Merge `patch` into the row in `_STORE[collection]` whose id matches
    `row_id`; persist on success. Returns the updated row. 404 on no match.
    `id` is identity — a patch carrying `{"id": ...}` is silently dropped
    so a request can't pivot a row onto someone else's primary key.

    ponytail: one helper, four callers. Ceiling: O(n) linear scan per
    call (fine for OFP volumes). Upgrade: add an in-memory `id -> row`
    index if collections grow past a few thousand rows.
    """
    for row in _STORE[collection]:
        if row.get("id") == row_id:
            row.update({k: v for k, v in (patch or {}).items() if k != "id"})
            _save_store()
            return row
    raise HTTPException(
        status_code=404,
        detail=f"{collection[:-1]} {row_id} not found",
    )


def _delete(collection: str, row_id: str) -> Dict[str, Any]:
    """Remove the row whose id matches `row_id` from `_STORE[collection]`;
    persist on success. Returns a tiny `{"deleted", "remaining"}` receipt.
    404 if nothing matched. Empty-collection result is preserved across
    restart thanks to `_load_store`'s empty-list-safe `get(key, fallback)`.

    ponytail: linear scan + filter. Ceiling: O(n). Upgrade: same as `_upsert`
    — add an id-index when collections get big.
    """
    before = len(_STORE[collection])
    _STORE[collection] = [r for r in _STORE[collection] if r.get("id") != row_id]
    if len(_STORE[collection]) == before:
        raise HTTPException(
            status_code=404,
            detail=f"{collection[:-1]} {row_id} not found",
        )
    _save_store()
    return {"deleted": row_id, "remaining": len(_STORE[collection])}


def setup_ofp_local_api_routes() -> APIRouter:
    """Returns an APIRouter(/api/ofp) wired with health, login, and CRUD for
    the seven SAMPLE_DATA collections. Same-origin so the modal's CSP allows it."""
    router = APIRouter(prefix="/api/ofp", tags=["ofp-local"])

    @router.get("/health")
    def health() -> Dict[str, str]:
        # Mirror what pingApi() expects: any 2xx with parseable JSON keeps
        # state.api.up=true. Body intentionally tiny — the JS only flips a flag.
        return {"status": "ok"}

    @router.post("/auth/login")
    def login(body: Dict[str, Any] = {}) -> Dict[str, Any]:
        # Local mock: any non-empty email yields a stable-looking token. We
        # deliberately skip password checks — the trust boundary is the
        # Odysseus login gate, not the OFP data layer.
        email = (body or {}).get("email", "").strip()
        if not email:
            raise HTTPException(status_code=400, detail="email required")
        token = "local-" + email.replace("@", "-at-").replace(".", "-")
        return {"token": token, "user": email}

    @router.get("/jobs")
    def list_jobs() -> List[Dict[str, Any]]:
        return list(_STORE["jobs"])  # ponytail: snapshot copy. Ceiling: O(n) per GET.

    @router.post("/jobs")
    def create_job(body: Dict[str, Any] = {}) -> Dict[str, Any]:
        if not body.get("title"):
            raise HTTPException(status_code=400, detail="title required")
        # Id-conflict defense: body's `id` wins the row spread below (so the
        # JS modal can round-trip its local uid), but two parallel POSTs
        # carrying the same id would otherwise create dupes whose identical
        # ids break `_upsert`'s "first match wins" loop. 409 keeps `_STORE`
        # deterministic. ponytail: one linear scan. Ceiling: O(n) per POST;
        # fine for OFP volumes. Upgrade: switch to an id->row index if POST
        # traffic ever goes high.
        body_id = (body or {}).get("id")
        if body_id and any(r.get("id") == body_id for r in _STORE["jobs"]):
            raise HTTPException(
                status_code=409,
                detail=f"job {body_id} already exists",
            )
        row = {"id": body_id or _next_id("j"), **body}
        _STORE["jobs"].append(row)
        _save_store()
        return row

    @router.put("/jobs/{job_id}")
    def update_job(job_id: str, body: Dict[str, Any] = {}) -> Dict[str, Any]:
        return _upsert("jobs", job_id, body)

    @router.delete("/jobs/{job_id}")
    def delete_job(job_id: str) -> Dict[str, Any]:
        return _delete("jobs", job_id)

    @router.get("/customers")
    def list_customers() -> List[Dict[str, Any]]:
        return list(_STORE["customers"])  # ponytail: snapshot copy. Ceiling: O(n) per GET.

    @router.post("/customers")
    def create_customer(body: Dict[str, Any] = {}) -> Dict[str, Any]:
        if not body.get("name"):
            raise HTTPException(status_code=400, detail="name required")
        # Id-conflict defense — see create_job for the rationale (same
        # one-linear-scan pattern as the jobs handler).
        body_id = (body or {}).get("id")
        if body_id and any(r.get("id") == body_id for r in _STORE["customers"]):
            raise HTTPException(
                status_code=409,
                detail=f"customer {body_id} already exists",
            )
        row = {"id": body_id or _next_id("c"), **body}
        _STORE["customers"].append(row)
        _save_store()
        return row

    @router.put("/customers/{customer_id}")
    def update_customer(customer_id: str, body: Dict[str, Any] = {}) -> Dict[str, Any]:
        return _upsert("customers", customer_id, body)

    @router.delete("/customers/{customer_id}")
    def delete_customer(customer_id: str) -> Dict[str, Any]:
        return _delete("customers", customer_id)

    @router.get("/services")
    def list_services() -> List[Dict[str, Any]]:
        return list(_STORE["services"])  # ponytail: snapshot copy. Ceiling: O(n) per GET.

    @router.get("/inventory")
    def list_inventory() -> List[Dict[str, Any]]:
        return list(_STORE["inventory_items"])  # ponytail: snapshot copy. Ceiling: O(n) per GET.

    @router.post("/inventory")
    def create_inventory_item(body: Dict[str, Any] = {}) -> Dict[str, Any]:
        if not body.get("name"):
            raise HTTPException(status_code=400, detail="name required")
        # Id-conflict defense — see create_job for the rationale (same
        # one-linear-scan pattern as the jobs handler).
        body_id = (body or {}).get("id")
        if body_id and any(r.get("id") == body_id for r in _STORE["inventory_items"]):
            raise HTTPException(
                status_code=409,
                detail=f"inventory item {body_id} already exists",
            )
        row = {"id": body_id or _next_id("inv"), **body}
        _STORE["inventory_items"].append(row)
        _save_store()
        return row

    @router.put("/inventory/{item_id}")
    def update_inventory_item(item_id: str, body: Dict[str, Any] = {}) -> Dict[str, Any]:
        return _upsert("inventory_items", item_id, body)

    @router.delete("/inventory/{item_id}")
    def delete_inventory_item(item_id: str) -> Dict[str, Any]:
        return _delete("inventory_items", item_id)

    @router.get("/estimates")
    def list_estimates() -> List[Dict[str, Any]]:
        # Backfill `line_items: []` on every row so the UI can map safely
        # without null-checks. Legacy seed rows predate the schema; new rows
        # created via POST carry the field already. Read-only — we don't
        # mutate _STORE here so _save_store() stays the only writer.
        # ponytail: per-row dict-spread on every GET. Ceiling: O(n) extra
        # allocation per request. Upgrade: materialize once on _load_store
        # if read traffic grows.
        return [
            {**row, "line_items": row.get("line_items") or []}
            for row in _STORE["estimates"]
        ]

    @router.post("/estimates")
    def create_estimate(body: Dict[str, Any] = {}) -> Dict[str, Any]:
        if not body.get("title"):
            raise HTTPException(status_code=400, detail="title required")
        # Id-conflict defense — see create_job for the rationale. The same
        # pattern protects the estimates collection from parallel-POST dupes.
        body_id = (body or {}).get("id")
        if body_id and any(r.get("id") == body_id for r in _STORE["estimates"]):
            raise HTTPException(
                status_code=409,
                detail=f"estimate {body_id} already exists",
            )
        row = {
            "id": body_id or _next_id("e"),
            "customer_id": (body or {}).get("customer_id", ""),
            "title": (body or {}).get("title", "New estimate"),
            "amount": 0,
            "status": (body or {}).get("status", "draft"),
            "created_at": time.strftime("%Y-%m-%d"),
            "expires_at": (body or {}).get("expires_at", ""),
            "line_items": [],
            **(body or {}),
        }
        # Backfill in case the caller omitted line_items / created_at.
        row.setdefault("line_items", [])
        row.setdefault("created_at", time.strftime("%Y-%m-%d"))
        _STORE["estimates"].append(row)
        _save_store()
        return row

    @router.put("/estimates/{estimate_id}")
    def update_estimate(estimate_id: str, body: Dict[str, Any] = {}) -> Dict[str, Any]:
        """Updates an estimate. Schema-aware: if the body carries a non-empty
        `line_items` array, the server recomputes `amount` from the line
        items and stores it — the body's amount is ignored so the UI can't
        ship a mismatched cart+amount. An empty `line_items` list in body
        clears the cart without touching amount (legacy flat-amount
        estimates stay flat). Hand-rolled here (not via _upsert) because the
        upsert helper assumes pass-through patches; we need pre-write
        normalization — the same reason update_invoice is hand-rolled.
        ponytail: in-place upsert loop duplicates _upsert for one extra
        field. Ceiling: ~8 extra lines, fine. Upgrade: add an optional
        patch-processor kwarg to `_upsert` if more collections need
        pre-write transforms."""
        patch = {k: v for k, v in (body or {}).items() if k != "id"}
        line_items = patch.get("line_items")
        if isinstance(line_items, list) and len(line_items) > 0:
            computed = round(
                sum(
                    float(li.get("price", 0)) * float(li.get("quantity", 1))
                    for li in line_items
                ),
                2,
            )
            patch["amount"] = computed
        for row in _STORE["estimates"]:
            if row.get("id") == estimate_id:
                row.update(patch)
                row.setdefault("line_items", [])
                _save_store()
                return row
        raise HTTPException(
            status_code=404,
            detail=f"estimate {estimate_id} not found",
        )

    @router.delete("/estimates/{estimate_id}")
    def delete_estimate(estimate_id: str) -> Dict[str, Any]:
        # Mirrors the existing delete_job / delete_customer / delete_invoice
        # pattern via the shared `_delete` helper.
        return _delete("estimates", estimate_id)

    @router.get("/invoices")
    def list_invoices() -> List[Dict[str, Any]]:
        # Backfill `line_items: []` on every row so the UI can map safely
        # without null-checks. Legacy seed rows predate the schema; new rows
        # created via POST carry the field already. Read-only — we don't
        # mutate _STORE here so _save_store() stays the only writer.
        # ponytail: per-row dict-spread on every GET. Ceiling: O(n) extra
        # allocation per request. Upgrade: materialize once on _load_store
        # if read traffic grows.
        return [
            {**row, "line_items": row.get("line_items") or []}
            for row in _STORE["invoices"]
        ]

    @router.post("/invoices")
    def create_invoice(body: Dict[str, Any] = {}) -> Dict[str, Any]:
        # Default fresh invoice: issued today, draft status, empty line_items.
        # Body merges on top so the form can set customer_id/title etc.
        # Id-conflict defense — see create_job for the rationale. The same
        # pattern protects the invoices collection from parallel-POST dupes.
        body_id = (body or {}).get("id")
        if body_id and any(r.get("id") == body_id for r in _STORE["invoices"]):
            raise HTTPException(
                status_code=409,
                detail=f"invoice {body_id} already exists",
            )
        row = {
            "id": body_id or _next_id("i"),
            "customer_id": "",
            "title": "New invoice",
            "total": 0,
            "balance": 0,
            "status": "draft",
            "issued_at": time.strftime("%Y-%m-%d"),
            "due_at": "",
            "job_id": None,
            "line_items": [],
            **(body or {}),
        }
        # Backfill in case the caller omitted line_items.
        row.setdefault("line_items", [])
        _STORE["invoices"].append(row)
        _save_store()
        return row

    @router.put("/invoices/{invoice_id}")
    def update_invoice(invoice_id: str, body: Dict[str, Any] = {}) -> Dict[str, Any]:
        """Updates an invoice. Schema-aware: if the body carries a non-empty
        `line_items` array, the server recomputes `total` from the line items
        and stores it — the body's total is ignored so the UI can't ship a
        mismatched cart+total. An empty `line_items` list in body clears the
        cart without touching total (legacy flat-total invoices stay flat).
        Hand-rolled here (not via _upsert) because the upsert helper assumes
        pass-through patches; we need pre-write normalization.
        ponytail: in-place upsert loop duplicates _upsert for one extra
        field. Ceiling: ~8 extra lines, fine. Upgrade: add an optional
        patch-processor kwarg to `_upsert` if more collections need
        pre-write transforms."""
        patch = {k: v for k, v in (body or {}).items() if k != "id"}
        line_items = patch.get("line_items")
        if isinstance(line_items, list) and len(line_items) > 0:
            computed = round(
                sum(
                    float(li.get("price", 0)) * float(li.get("quantity", 1))
                    for li in line_items
                ),
                2,
            )
            patch["total"] = computed
        for row in _STORE["invoices"]:
            if row.get("id") == invoice_id:
                row.update(patch)
                row.setdefault("line_items", [])
                _save_store()
                return row
        raise HTTPException(
            status_code=404,
            detail=f"invoice {invoice_id} not found",
        )

    @router.delete("/invoices/{invoice_id}")
    def delete_invoice(invoice_id: str) -> Dict[str, Any]:
        # Mirrors the existing delete_job / delete_customer pattern via the
        # shared `_delete` helper. Empty-collection survive-across-restart
        # is already covered by the stage-3 reseed-fix proof.
        return _delete("invoices", invoice_id)

    @router.get("/team")
    def list_team() -> List[Dict[str, Any]]:
        return list(_STORE["team"])  # ponytail: snapshot copy. Ceiling: O(n) per GET.

    return router
