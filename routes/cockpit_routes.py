"""Read-only system cockpit summary for the Odysseus control plane."""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request

from core.middleware import require_admin


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    try:
        records = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            record = json.loads(line)
            if isinstance(record, dict):
                records.append(record)
        return records
    except (OSError, json.JSONDecodeError):
        return []


def _is_self_test(record: dict[str, Any]) -> bool:
    identity = " ".join(
        str(record.get(field, ""))
        for field in ("handoff_id", "worker_id", "experiment_id", "change")
    ).lower()
    return "selftest" in identity or "self-test" in identity


def _latest_unique(records: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for record in records:
        record_id = str(record.get(key) or "")
        if record_id:
            latest[record_id] = record
    return list(latest.values())


def _source_age_seconds(timestamp: Any) -> int | None:
    if not isinstance(timestamp, str) or not timestamp:
        return None
    try:
        observed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=datetime.now().astimezone().tzinfo)
        return max(0, int((datetime.now(timezone.utc) - observed).total_seconds()))
    except ValueError:
        return None


def _service_health_summary(health: dict[str, Any]) -> dict[str, Any]:
    services = health.get("services") if isinstance(health, dict) else {}
    services = services if isinstance(services, dict) else {}
    rollup = health.get("rollup") if isinstance(health, dict) else {}
    rollup = rollup if isinstance(rollup, dict) else {}

    attention = []
    managed_down = 0
    for service_id, service in services.items():
        if not isinstance(service, dict) or service.get("up"):
            continue
        state = str(service.get("state") or "unknown")
        if state == "down-no-autostart":
            managed_down += 1
            continue
        attention.append({
            "id": service_id,
            "state": state,
            "group": service.get("group"),
            "tier": service.get("tier"),
            "port": service.get("port"),
            "error": service.get("last_error"),
            "action": service.get("action_this_cycle"),
        })

    attention.sort(key=lambda item: (
        0 if item["state"] == "failed-to-start" else 1,
        0 if item.get("tier") == "A" else 1,
        item["id"],
    ))
    return {
        "observed_at": health.get("timestamp") if isinstance(health, dict) else None,
        "source_age_seconds": _source_age_seconds(health.get("timestamp")) if isinstance(health, dict) else None,
        "up": rollup.get("up", 0),
        "total": rollup.get("total", len(services)),
        "healthy": bool(rollup.get("healthy", False)),
        "managed_down": managed_down,
        "attention": attention,
        "attention_count": len(attention),
    }


def _orange_summary(orange_jobs: dict[str, Any]) -> dict[str, Any]:
    jobs = orange_jobs.get("jobs") if isinstance(orange_jobs, dict) else []
    jobs = jobs if isinstance(jobs, list) else []
    items = [
        {
            "id": job.get("id"),
            "owner": job.get("owner"),
            "reason": job.get("reason"),
            "next_action": job.get("next_action"),
            "observed_at": job.get("last_observed_status_at"),
        }
        for job in jobs
        if isinstance(job, dict) and job.get("status") == "ORANGE"
    ]
    return {"count": len(items), "items": items[:8]}


def _scorecard_summary(scorecard: Any) -> dict[str, Any] | None:
    if not isinstance(scorecard, dict):
        return None
    return {
        "bot": scorecard.get("bot"),
        "generated_at": scorecard.get("generated_at"),
        "settled_picks": scorecard.get("settled_picks", 0),
        "cancelled_picks": scorecard.get("cancelled_picks", 0),
        "unresolved_picks": scorecard.get("unresolved_picks", 0),
        "wins": scorecard.get("wins", 0),
        "losses": scorecard.get("losses", 0),
        "win_rate": scorecard.get("win_rate"),
        "total_profit_loss": scorecard.get("total_profit_loss"),
        "roi_pct": scorecard.get("roi_pct"),
    }


def setup_cockpit_routes() -> APIRouter:
    router = APIRouter(tags=["cockpit"])
    home = Path.home()
    brainz = home / "Brainz"
    hermes = home / ".hermes"

    @router.get("/api/cockpit/summary")
    async def cockpit_summary(request: Request) -> dict[str, Any]:
        require_admin(request)
        service_health = _read_json(hermes / "state" / "service-health.json", {})
        orange_jobs = _read_json(hermes / "cron" / "orange-jobs.json", {})
        handoffs = _read_jsonl(hermes / "state" / "handoff-promotions.jsonl")
        promotions = _read_jsonl(hermes / "state" / "promotion-queue.jsonl")
        visible_handoffs = _latest_unique(
            [record for record in handoffs if not _is_self_test(record)], "handoff_id"
        )
        visible_promotions = _latest_unique(
            [record for record in promotions if not _is_self_test(record)], "experiment_id"
        )
        scorecards = [
            _scorecard_summary(
                _read_json(brainz / "data" / "scorecards" / f"{bot}.scorecard.v1.json", None)
            )
            for bot in ("sportsclaw", "tradingdesk", "mining-ops-bot")
        ]
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "health": _service_health_summary(service_health),
            "orange": _orange_summary(orange_jobs),
            "approvals": {
                "handoffs": visible_handoffs[:8],
                "handoff_count": len(visible_handoffs),
                "promotions": visible_promotions[:8],
                "promotion_count": len(visible_promotions),
                "ignored_self_tests": (
                    len(handoffs) - len([record for record in handoffs if not _is_self_test(record)])
                    + len(promotions) - len([record for record in promotions if not _is_self_test(record)])
                ),
            },
            "scorecards": [scorecard for scorecard in scorecards if scorecard],
        }

    return router
