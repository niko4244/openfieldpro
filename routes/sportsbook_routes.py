# routes/sportsbook_routes.py
"""Sportsbook tab: reads the SportsClaw bot's paper-trading ledger
(Brainz/data/portfolio.json) and serves picks + ROI to the sidebar tab.
"""
import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix="/api/sportsbook", tags=["sportsbook"])

# ponytail: hardcoded to the one bot this tab cares about. If more
# paper-trading bots get a sidebar tab later, parameterize by bot name.
PORTFOLIO_FILE = Path.home() / "Brainz" / "data" / "portfolio.json"
BOT = "sportsclaw"


def _load_picks():
    if not PORTFOLIO_FILE.exists():
        return None
    data = json.loads(PORTFOLIO_FILE.read_text(encoding="utf-8"))
    return data.get("bots", {}).get(BOT)


def setup_sportsbook_routes():
    @router.get("/summary")
    def get_summary():
        bot = _load_picks()
        if bot is None:
            return {
                "starting_balance": 0, "current_balance": 0,
                "roi_pct": 0, "record": {"wins": 0, "losses": 0, "pushes": 0, "cancelled": 0},
                "pending": [], "recent": [],
            }

        picks = bot.get("picks", [])
        starting = bot.get("starting_balance", 0)
        current = bot.get("current_balance", starting)
        roi_pct = ((current - starting) / starting * 100) if starting else 0

        record = {"wins": 0, "losses": 0, "pushes": 0, "cancelled": 0}
        for p in picks:
            outcome = p.get("outcome")
            if outcome == "win":
                record["wins"] += 1
            elif outcome == "loss":
                record["losses"] += 1
            elif outcome == "push":
                record["pushes"] += 1
            elif outcome == "cancelled":
                record["cancelled"] += 1

        pending = [p for p in picks if p.get("outcome") in (None, "pending")]
        resolved = [p for p in picks if p.get("outcome") not in (None, "pending")]
        resolved_chrono = sorted(resolved, key=lambda p: p.get("resolved_at") or p.get("timestamp", ""))

        # Running balance after each resolved pick, in chronological order,
        # for the growth chart. Starts at the bot's starting_balance.
        balance_history = [{"label": "Start", "balance": round(starting, 2)}]
        running = starting
        for p in resolved_chrono:
            running += p.get("pnl", 0) or 0
            balance_history.append({
                "label": p.get("resolved_at") or p.get("timestamp", ""),
                "balance": round(running, 2),
            })

        resolved.sort(key=lambda p: p.get("resolved_at") or p.get("timestamp", ""), reverse=True)

        return {
            "starting_balance": starting,
            "current_balance": round(current, 2),
            "roi_pct": round(roi_pct, 2),
            "record": record,
            "pending": pending,
            "recent": resolved,
            "balance_history": balance_history,
        }

    return router
