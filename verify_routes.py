"""End-to-end verifier for routes/ofp_local_api_routes.py.

Goals:
  1. py_compile smoke (syntax)
  2. Boot fresh uvicorn on :7000 from a clean .ofp-store.json
  3. POST/PUT/DELETE round-trip on jobs + customers, with id-preservation
     and 404-on-miss verified
  4. Empty the customers collection via DELETE; restart uvicorn; confirm
     the empty list survives (proves the `collections.get(key, fallback)`
     reseed-footgun tightening). Jobs key still has seed data.
  5. JS merged-line regression check (was a known broken state — split).

Runs in three stages separated by server restarts. Uses powershell to kill
orphan uvicorn on Windows; falls back to fuser on Unix if needed.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import urllib.request
import urllib.error

BASE = "http://127.0.0.1:7000/api/ofp"
REPO = Path(__file__).resolve().parent
STORE_PATH = REPO / ".ofp-store.json"
STORE_TMP = REPO / ".ofp-store.json.tmp"
ROUTES_PY = REPO / "routes" / "ofp_local_api_routes.py"
OFP_JS = REPO / "static" / "js" / "openfieldpro.js"

PYTHON = REPO / "venv" / "Scripts" / "python.exe"


def _http(method: str, path: str, body=None) -> tuple[int, dict | str | None]:
    url = BASE + path
    data = None
    headers = {"Content-Type": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw)
            except json.JSONDecodeError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def _kill_7000() -> None:
    """Kill whatever is listening on port 7000. Windows-first."""
    if sys.platform == "win32":
        # powershell native — handles TIME_WAIT correctly via Stop-Process
        subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-NetTCPConnection -LocalPort 7000 -ErrorAction SilentlyContinue "
             "| Select-Object -ExpandProperty OwningProcess | "
             "ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"],
            check=False, timeout=15,
        )
    else:
        subprocess.run(["fuser", "-k", "7000/tcp"], check=False, timeout=15)
    time.sleep(12)


def _launch_uvicorn() -> None:
    env = os.environ.copy()
    env["LOCALHOST_BYPASS"] = "true"
    env["AUTH_ENABLED"] = "false"
    log_out = REPO / "uvicorn.out.log"
    log_err = REPO / "uvicorn.err.log"
    log_out.unlink(missing_ok=True)
    log_err.unlink(missing_ok=True)
    cwd = str(REPO)
    subprocess.Popen(
        [str(PYTHON), "-m", "uvicorn", "app:app",
         "--host", "127.0.0.1", "--port", "7000"],
        cwd=cwd, env=env,
        stdout=log_out.open("w"), stderr=log_err.open("w"),
        stdin=subprocess.DEVNULL,
    )
    # busy-wait until /health responds 200
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            status, _ = _http("GET", "/health")
            if status == 200:
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError("uvicorn did not become healthy in 20s")


def check(name: str, ok: bool, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    line = f"[{mark}] {name}" + (f" — {detail}" if detail else "")
    print(line)
    return ok


def stage_compile() -> bool:
    print("=== STAGE 1: py_compile + JS regression check ===")
    try:
        subprocess.check_call(
            [str(PYTHON), "-m", "py_compile", str(ROUTES_PY)],
            stdout=subprocess.DEVNULL
        )
        ok_py = True
    except subprocess.CalledProcessError:
        ok_py = False
    print(f"  py_compile routes/ofp_local_api_routes.py: {'PASS' if ok_py else 'FAIL'}")

    merged_pattern = (
        "hydrate();         // restore any user-created jobs/customers "
        "from sessionStorage            if (!state.firstShown) {"
    )
    if merged_pattern in OFP_JS.read_text(encoding="utf-8"):
        print("  JS merged-line check: FAIL (line still merged — modal would be broken)")
        return False
    print("  JS merged-line check: PASS (line properly split)")
    return ok_py


def stage_round_trip() -> bool:
    print("=== STAGE 2: POST+PUT+DELETE round-trip on jobs + customers ===")
    # Clean baseline
    STORE_PATH.unlink(missing_ok=True)
    STORE_TMP.unlink(missing_ok=True)
    _kill_7000()
    _launch_uvicorn()

    results = []

    # Baseline counts
    _, baseline_jobs = _http("GET", "/jobs")
    _, baseline_custs = _http("GET", "/customers")
    results.append(check(
        "baseline /jobs == 10", isinstance(baseline_jobs, list) and len(baseline_jobs) == 10,
        f"got {len(baseline_jobs) if isinstance(baseline_jobs, list) else 'err'}"))
    results.append(check(
        "baseline /customers == 7", isinstance(baseline_custs, list) and len(baseline_custs) == 7,
        f"got {len(baseline_custs) if isinstance(baseline_custs, list) else 'err'}"))

    # POST a new job
    status, new_job = _http("POST", "/jobs", body={
        "title": "PUT-DELETE-roundtrip",
        "customer_id": "c1",
        "status": "scheduled",
    })
    results.append(check(
        "POST /jobs returns 200 + body with id",
        status == 200 and isinstance(new_job, dict) and new_job.get("id", "").startswith("j-"),
        f"status={status} id={new_job.get('id') if isinstance(new_job, dict) else '?'}"))
    job_id = new_job["id"] if isinstance(new_job, dict) else None

    # POST id-conflict defense — repeat with same id must 409, not append a dupe.
    if job_id:
        status, conflict = _http("POST", "/jobs", body={
            "id": job_id,
            "title": "duplicate-id-attack",
        })
        results.append(check(
            "POST /jobs with existing id -> 409 (id-conflict defense)",
            status == 409,
            f"status={status}"))

    # PUT the job — flip status + add notes
    if job_id:
        status, updated = _http("PUT", f"/jobs/{job_id}", body={
            "status": "completed",
            "notes": "status flipped via PUT",
            "title": "PUT-DELETE-roundtrip (edited)",
        })
        results.append(check(
            "PUT /jobs/{id} preserves id + applies body",
            status == 200 and isinstance(updated, dict)
            and updated.get("id") == job_id
            and updated.get("status") == "completed"
            and "edited" in (updated.get("title") or ""),
            f"id_kept={updated.get('id')==job_id if isinstance(updated, dict) else False} "
            f"status={updated.get('status') if isinstance(updated, dict) else '?'}"))

    # PUT missing id — expect 404
    status, _ = _http("PUT", "/jobs/j-doesnotexist", body={"status": "x"})
    results.append(check("PUT on missing id -> 404", status == 404, f"status={status}"))

    # PUT id-pivot defense — body sets "id" to a different key; server must ignore
    if job_id:
        status, updated = _http("PUT", f"/jobs/{job_id}", body={
            "id": "j-pivot-attack", "status": "cancelled",
        })
        results.append(check(
            "PUT id-pivot defense: body id is ignored, original id preserved",
            status == 200 and isinstance(updated, dict) and updated.get("id") == job_id
            and updated.get("status") == "cancelled",
            f"id_after={updated.get('id') if isinstance(updated, dict) else '?'}"))

    # DELETE the job
    if job_id:
        status, del_resp = _http("DELETE", f"/jobs/{job_id}")
        results.append(check(
            "DELETE /jobs/{id} returns 200 + remaining count",
            status == 200 and isinstance(del_resp, dict) and del_resp.get("deleted") == job_id,
            f"status={status} resp={del_resp}"))

    # DELETE missing id — expect 404
    status, _ = _http("DELETE", "/jobs/j-doesnotexist")
    results.append(check("DELETE on missing id -> 404", status == 404, f"status={status}"))

    # Customer PUT/DELETE
    status, new_cust = _http("POST", "/customers", body={
        "name": "PUT-DELETE-Cust", "email": "x@x",
    })
    results.append(check(
        "POST /customers returns 200 + body with id",
        status == 200 and isinstance(new_cust, dict) and new_cust.get("id", "").startswith("c-"),
        f"id={new_cust.get('id') if isinstance(new_cust, dict) else '?'}"))
    cust_id = new_cust["id"] if isinstance(new_cust, dict) else None

    if cust_id:
        status, updated = _http("PUT", f"/customers/{cust_id}", body={"phone": "(555) 999-0000"})
        results.append(check(
            "PUT /customers/{id} applies phone, keeps id",
            status == 200 and isinstance(updated, dict)
            and updated.get("id") == cust_id
            and updated.get("phone") == "(555) 999-0000",
            f"phone={updated.get('phone') if isinstance(updated, dict) else '?'}"))

    if cust_id:
        status, _ = _http("DELETE", f"/customers/{cust_id}")
        results.append(check(
            "DELETE /customers/{id} returns 200",
            status == 200 and isinstance(_, dict),
            f"status={status}"))

    # Counts should be back to baseline (POST+DELETE balanced)
    _, after_jobs = _http("GET", "/jobs")
    _, after_custs = _http("GET", "/customers")
    results.append(check(
        "/jobs count back to 10 after balanced POST/DELETE",
        isinstance(after_jobs, list) and len(after_jobs) == 10,
        f"got {len(after_jobs) if isinstance(after_jobs, list) else 'err'}"))
    results.append(check(
        "/customers count back to 7 after balanced POST/DELETE",
        isinstance(after_custs, list) and len(after_custs) == 7,
        f"got {len(after_custs) if isinstance(after_custs, list) else 'err'}"))

    return all(results)


def stage_reseed_fix() -> bool:
    print("=== STAGE 3: empty-list reseed-fix proof — restart-survival ===")
    # DELETE all 7 seed customers
    for cid in ("c1", "c2", "c3", "c4", "c5", "c6", "c7"):
        status, _ = _http("DELETE", f"/customers/{cid}")
        if status != 200:
            print(f"  WARN: deleting {cid} returned status={status}")

    # File should now have customers=[]
    payload = json.loads(STORE_PATH.read_text(encoding="utf-8"))
    on_disk = payload.get("collections", {}).get("customers", "MISSING")
    print(f"  on-disk customers after deletes: type={type(on_disk).__name__} value={on_disk!r}")
    ok1 = isinstance(on_disk, list) and len(on_disk) == 0

    # Restart uvicorn (kills + relaunches); cold-boots _load_store from disk
    _kill_7000()
    _launch_uvicorn()

    _, after_restart = _http("GET", "/customers")
    print(f"  after-restart /customers: type={type(after_restart).__name__} "
          f"len={len(after_restart) if isinstance(after_restart, list) else 'err'}")
    ok2 = isinstance(after_restart, list) and len(after_restart) == 0

    # Jobs key should still have its seed (partial-write fallback still works)
    _, after_jobs = _http("GET", "/jobs")
    print(f"  after-restart /jobs: len={len(after_jobs) if isinstance(after_jobs, list) else 'err'}")
    ok3 = isinstance(after_jobs, list) and len(after_jobs) == 10

    return check(
        "empty customers persisted to disk", ok1, "customers=[] literal in .ofp-store.json"
    ) and check(
        "empty customers SURVIVES restart (reseed-fix proof: was 7 before fix)",
        ok2, "GET /customers after uvicorn restart should remain []"
    ) and check(
        "jobs key still has seed (partial-write fallback intact)",
        ok3, "GET /jobs == 10 after restart",
    )


def stage_inventory() -> bool:
    """Stage 4: inventory CRUD + invoice line-items round-trip.

    Runs after stage_reseed_fix (which leaves customers=[] on disk but
    leaves jobs/invoices untouched). Inventory + invoices collections
    are independent of the customers/jobs collections already exercised
    by stages 2–3, so re-running on the same server is safe.
    """
    print("=== STAGE 4: inventory CRUD + invoice line-items round-trip ===")
    results = []

    # Inventory catalog: baseline should be 6 seed items.
    _, baseline_inv = _http("GET", "/inventory")
    results.append(check(
        "baseline /inventory == 6 seed items",
        isinstance(baseline_inv, list) and len(baseline_inv) == 6,
        f"got {len(baseline_inv) if isinstance(baseline_inv, list) else 'err'}"))

    # POST /inventory missing name -> 400
    status, _ = _http("POST", "/inventory", body={"sku": "X"})
    results.append(check(
        "POST /inventory with no name -> 400",
        status == 400, f"status={status}"))

    # POST /inventory creates a row with id starting "inv-"
    status, new_item = _http("POST", "/inventory", body={
        "name": "Verify-Routes Test Item", "sku": "VRT-001",
        "category": "part", "default_price": 12.34,
        "unit": "each", "taxable": True,
    })
    results.append(check(
        "POST /inventory returns 200 + body starts with id='inv-'",
        status == 200 and isinstance(new_item, dict)
        and new_item.get("id", "").startswith("inv-"),
        f"status={status} id={new_item.get('id') if isinstance(new_item, dict) else '?'}"))
    item_id = new_item.get("id") if isinstance(new_item, dict) else None

    # PUT /inventory/{id} preserves id + applies patch
    if item_id:
        status, updated = _http("PUT", f"/inventory/{item_id}", body={
            "default_price": 99.99,
            "description": "updated by verify_routes",
        })
        results.append(check(
            "PUT /inventory/{id} preserves id + applies price",
            status == 200 and isinstance(updated, dict)
            and updated.get("id") == item_id
            and abs(float(updated.get("default_price", 0)) - 99.99) < 0.01,
            f"id_kept={updated.get('id')==item_id if isinstance(updated, dict) else False} "
            f"price={updated.get('default_price') if isinstance(updated, dict) else '?'}"))

    # PUT on missing id -> 404
    status, _ = _http("PUT", "/inventory/inv-doesnotexist", body={"name": "x"})
    results.append(check("PUT inventory missing id -> 404", status == 404, f"status={status}"))

    # DELETE /inventory/{id} → 200 + remaining count
    if item_id:
        status, del_resp = _http("DELETE", f"/inventory/{item_id}")
        results.append(check(
            "DELETE /inventory/{id} returns 200 + remaining",
            status == 200 and isinstance(del_resp, dict) and del_resp.get("deleted") == item_id,
            f"status={status} resp={del_resp}"))

    # /invoices backfills empty line_items on legacy seed rows.
    _, all_invoices = _http("GET", "/invoices")
    ok_backfill = isinstance(all_invoices, list) and all(
        isinstance(i, dict) and isinstance(i.get("line_items"), list) for i in all_invoices
    )
    results.append(check(
        "/invoices backfills empty line_items on every row (legacy schema-safe)",
        ok_backfill,
        f"all rows have line_items list: {ok_backfill}"))

    # POST /invoices returns row with line_items=[] default.
    status, new_inv = _http("POST", "/invoices", body={
        "customer_id": "c1", "title": "Verify-Routes Line Items Test",
        "status": "draft", "issued_at": "2026-06-26",
    })
    inv_id = new_inv.get("id") if isinstance(new_inv, dict) else None
    results.append(check(
        "POST /invoices returns row with line_items=[] default",
        status == 200 and isinstance(new_inv, dict)
        and isinstance(new_inv.get("line_items"), list)
        and len(new_inv.get("line_items") or []) == 0,
        f"line_items={new_inv.get('line_items') if isinstance(new_inv, dict) else '?'}"))

    # PUT /invoices/{id} with line_items recomputes total from cart
    # (body's `total` is IGNORED) — 2*34.99 + 4*18.50 = 143.98.
    if inv_id:
        status, updated = _http("PUT", f"/invoices/{inv_id}", body={
            "line_items": [
                {"inventory_id": "inv-cap455", "name": "Capacitor",
                 "price": 34.99, "quantity": 2, "taxable": True},
                {"inventory_id": "inv-refr410", "name": "Refrigerant",
                 "price": 18.50, "quantity": 4, "taxable": True},
            ],
            "total": 999.99,  # intentionally wrong — server must ignore and recompute
        })
        expected = 143.98
        ok_recompute = (
            status == 200 and isinstance(updated, dict)
            and updated.get("id") == inv_id
            and abs(float(updated.get("total", -1)) - expected) < 0.01
            and len(updated.get("line_items") or []) == 2
        )
        results.append(check(
            "PUT /invoices/{id} recomputes total from line_items "
            "(2×34.99 + 4×18.50 = 143.98, ignores body total)",
            ok_recompute,
            f"id_kept={updated.get('id')==inv_id if isinstance(updated, dict) else False} "
            f"total={updated.get('total') if isinstance(updated, dict) else '?'} "
            f"line_items_count={len(updated.get('line_items') or []) if isinstance(updated, dict) else '?'}"))

        # Idempotent id-pivot defense on invoices too.
        status, updated = _http("PUT", f"/invoices/{inv_id}", body={
            "id": "i-pivot-attack", "status": "sent",
        })
        results.append(check(
            "PUT /invoices id-pivot defense: body id ignored, original id preserved",
            status == 200 and isinstance(updated, dict)
            and updated.get("id") == inv_id
            and updated.get("status") == "sent",
            f"id_after={updated.get('id') if isinstance(updated, dict) else '?'} "
            f"status={updated.get('status') if isinstance(updated, dict) else '?'}"))

        # Empty line_items in body must NOT recompute (legacy flat-total path).
        status, updated = _http("PUT", f"/invoices/{inv_id}", body={
            "line_items": [],
            "status": "sent",
        })
        results.append(check(
            "PUT /invoices with empty line_items preserves prior total (143.98)",
            status == 200 and isinstance(updated, dict)
            and abs(float(updated.get("total", -1)) - 143.98) < 0.01,
            f"total_after={updated.get('total') if isinstance(updated, dict) else '?'}"))

        # DELETE /invoices/{id} -> 200 + receipt. Newly added to support OFP
        # persistence-after-reload for delete-invoice case handlers (case
        # 'delete-invoice' calls deleteInvoice(id) which now round-trips).
        status, del_inv = _http("DELETE", f"/invoices/{inv_id}")
        results.append(check(
            "DELETE /invoices/{id} returns 200 + receipt",
            status == 200 and isinstance(del_inv, dict)
            and del_inv.get("deleted") == inv_id,
            f"status={status} resp={del_inv}"))

    return all(results)


def stage_estimates() -> bool:
    """Stage 5: estimate CRUD + line-items round-trip.

    Mirrors stage_inventory exactly (POST/PUT/DELETE + 409 defense +
    line-items recompute + empty-line-items legacy path) but exercises
    the estimates collection. Estimates use the field name `amount`
    instead of invoices' `total` — same contract, separate field. The
    body amount is ignored by the server's PUT recompute, the same way
    update_invoice ignores body total — pinned by the 2×34.99 + 4×18.50
    = 143.98 fixture.
    """
    print("=== STAGE 5: estimate CRUD + line-items round-trip ===")
    results = []

    # Baseline — uploads from SAMPLE.estimates == 5 seed rows
    _, baseline_est = _http("GET", "/estimates")
    results.append(check(
        "baseline /estimates == 5 seed items",
        isinstance(baseline_est, list) and len(baseline_est) == 5,
        f"got {len(baseline_est) if isinstance(baseline_est, list) else 'err'}"))

    # Backfill on GET — legacy seed rows predate the schema; every row
    # must carry line_items=[] so the UI can iterate without checks.
    ok_backfill = isinstance(baseline_est, list) and all(
        isinstance(e, dict) and isinstance(e.get("line_items"), list)
        for e in baseline_est
    )
    results.append(check(
        "/estimates backfills empty line_items on every row (legacy schema-safe)",
        ok_backfill,
        f"all rows have line_items list: {ok_backfill}"))

    # POST /estimates missing title -> 400
    status, _ = _http("POST", "/estimates", body={})
    results.append(check(
        "POST /estimates with no title -> 400",
        status == 400, f"status={status}"))

    # POST /estimates creates a row with id starting "e-"
    status, new_est = _http("POST", "/estimates", body={
        "title": "Verify-Routes Estimate Test",
        "customer_id": "c1",
        "status": "draft",
        "expires_at": "2026-07-10",
    })
    est_id = new_est.get("id") if isinstance(new_est, dict) else None
    results.append(check(
        "POST /estimates returns 200 + body starts with id='e-'",
        status == 200 and isinstance(new_est, dict)
        and est_id is not None and est_id.startswith("e-")
        and isinstance(new_est.get("line_items"), list)
        and len(new_est.get("line_items") or []) == 0,
        f"status={status} id={est_id} line_items={new_est.get('line_items') if isinstance(new_est, dict) else '?'}"))

    # POST id-conflict defense
    if est_id:
        status, _ = _http("POST", "/estimates", body={
            "id": est_id, "title": "duplicate-id-attack",
        })
        results.append(check(
            "POST /estimates with existing id -> 409 (id-conflict defense)",
            status == 409, f"status={status}"))

    # PUT /estimates/{id} preserves id + applies body
    if est_id:
        status, updated = _http("PUT", f"/estimates/{est_id}", body={
            "status": "sent",
            "title": "Verify-Routes Estimate Test (edited)",
        })
        results.append(check(
            "PUT /estimates/{id} preserves id + applies body",
            status == 200 and isinstance(updated, dict)
            and updated.get("id") == est_id
            and updated.get("status") == "sent"
            and "edited" in (updated.get("title") or ""),
            f"id_kept={updated.get('id')==est_id if isinstance(updated, dict) else False} "
            f"status={updated.get('status') if isinstance(updated, dict) else '?'}"))

    # PUT missing id -> 404
    status, _ = _http("PUT", "/estimates/e-doesnotexist", body={"status": "x"})
    results.append(check("PUT estimates missing id -> 404", status == 404, f"status={status}"))

    # PUT id-pivot defense — body's "id" is ignored
    if est_id:
        status, updated = _http("PUT", f"/estimates/{est_id}", body={
            "id": "e-pivot-attack", "status": "approved",
        })
        results.append(check(
            "PUT /estimates id-pivot defense: body id ignored, original id preserved",
            status == 200 and isinstance(updated, dict)
            and updated.get("id") == est_id
            and updated.get("status") == "approved",
            f"id_after={updated.get('id') if isinstance(updated, dict) else '?'} "
            f"status={updated.get('status') if isinstance(updated, dict) else '?'}"))

    # PUT with line_items recomputes amount from cart (body's `amount` is
    # IGNORED) — 2*34.99 + 4*18.50 = 143.98. Mirrors the invoice fixture.
    if est_id:
        status, updated = _http("PUT", f"/estimates/{est_id}", body={
            "line_items": [
                {"inventory_id": "inv-cap455", "name": "Capacitor",
                 "price": 34.99, "quantity": 2, "taxable": True},
                {"inventory_id": "inv-refr410", "name": "Refrigerant",
                 "price": 18.50, "quantity": 4, "taxable": True},
            ],
            "amount": 999.99,  # intentionally wrong — server must ignore + recompute
        })
        ok_recompute = (
            status == 200 and isinstance(updated, dict)
            and updated.get("id") == est_id
            and abs(float(updated.get("amount", -1)) - 143.98) < 0.01
            and len(updated.get("line_items") or []) == 2
        )
        results.append(check(
            "PUT /estimates/{id} recomputes amount from line_items "
            "(2×34.99 + 4×18.50 = 143.98, ignores body amount)",
            ok_recompute,
            f"id_kept={updated.get('id')==est_id if isinstance(updated, dict) else False} "
            f"amount={updated.get('amount') if isinstance(updated, dict) else '?'} "
            f"line_items_count={len(updated.get('line_items') or []) if isinstance(updated, dict) else '?'}"))

        # Empty line_items in body must NOT recompute (legacy flat-amount path).
        status, updated = _http("PUT", f"/estimates/{est_id}", body={
            "line_items": [],
            "status": "approved",
        })
        results.append(check(
            "PUT /estimates with empty line_items preserves prior amount (143.98)",
            status == 200 and isinstance(updated, dict)
            and abs(float(updated.get("amount", -1)) - 143.98) < 0.01,
            f"amount_after={updated.get('amount') if isinstance(updated, dict) else '?'}"))

    # DELETE /estimates/{id} -> 200 + receipt
    if est_id:
        status, del_resp = _http("DELETE", f"/estimates/{est_id}")
        results.append(check(
            "DELETE /estimates/{id} returns 200 + receipt",
            status == 200 and isinstance(del_resp, dict)
            and del_resp.get("deleted") == est_id,
            f"status={status} resp={del_resp}"))

    return all(results)


def main() -> int:
    if not stage_compile():
        return 1
    if not stage_round_trip():
        return 2
    if not stage_reseed_fix():
        return 3
    if not stage_inventory():
        return 4
    if not stage_estimates():
        return 5
    print("\nAll stages PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
