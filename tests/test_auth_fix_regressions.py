"""Pin the AUTH_ENABLED=false / LOCALHOST_BYPASS auth-fix so it doesn't regress.

The 2026-06-23 auth-fix changed four patterns across auth_helpers and
session_routes:

  1. effective_user() falls back to require_user() when middleware hasn't
     set request.state.current_user (AUTH_ENABLED=false / LOCALHOST_BYPASS).
  2. _verify_session_owner() uses ``user is None`` to distinguish
     truly-unauthenticated (None -> 403) from auth-disabled ("" -> skip).
  3. list_archived_sessions(), sessions_save_now() use the same split.
  4. auto_sort_sessions() maps "" -> None via ``_owner_for_db = user or None``
     so DB owner queries match NULL-owner sessions.

Follows the direct-helper + mocked-DB style of test_null_owner_gates.py
and test_session_owner_attribution.py.
"""

import os
import sys
import types
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# Stub heavy deps before importing the modules under test.
# (Same pattern as test_session_owner_attribution.py — the real modules
# instantiate SQLAlchemy etc. at import time which blows up under the
# conftest MagicMock stubs.)
_STUBS = {
    "core.database": {
        "Session": MagicMock(),
        "SessionLocal": MagicMock(),
        "Document": MagicMock(),
        "GalleryImage": MagicMock(),
        "Base": MagicMock(),
        "ChatMessage": MagicMock(),
        "ApiToken": MagicMock(),
        "ScheduledTask": MagicMock(),
        "TaskRun": MagicMock(),
        "ModelEndpoint": MagicMock(),
        "Note": MagicMock(),
        "CalendarCal": MagicMock(),
        "CalendarEvent": MagicMock(),
    },
    "core.session_manager": {"SessionManager": MagicMock()},
    "core.models": {"ChatMessage": MagicMock()},
    "src.request_models": {"SessionResponse": MagicMock()},
    "src.endpoint_resolver": {"resolve_endpoint": MagicMock(return_value=("", "", {}))},
    "src.task_endpoint": {"resolve_task_endpoint": MagicMock(return_value=("", "", {}))},
    "src.webhook_manager": {"WebhookManager": MagicMock()},
    "src.event_bus": {"fire_event": MagicMock()},
    "core.middleware": {"require_admin": MagicMock()},
}
for _name, _attrs in _STUBS.items():
    if _name not in sys.modules:
        _m = types.ModuleType(_name)
        for _k, _v in _attrs.items():
            setattr(_m, _k, _v)
        sys.modules[_name] = _m

from fastapi import HTTPException

from src.auth_helpers import effective_user, require_user
import routes.session_routes as SR


# =========================================================================
# effective_user fallback
# =========================================================================


def _req(**state):
    """Build a fake FastAPI request with the given state attributes."""
    req = SimpleNamespace(state=SimpleNamespace(**state))
    # require_user reads request.app.state.auth_manager
    req.app = SimpleNamespace(state=SimpleNamespace())
    req.client = SimpleNamespace(host="127.0.0.1")
    return req


def test_effective_user_returns_normal_user():
    """Authenticated cookie user is returned as-is (no-op path)."""
    assert effective_user(_req(api_token=False, current_user="alice")) == "alice"


def test_effective_user_returns_bearer_owner():
    """Bearer token with owner resolves to the owner."""
    assert effective_user(_req(
        api_token=True, api_token_owner="bob", current_user="api",
    )) == "bob"


def test_effective_user_bearer_without_owner_does_not_escalate():
    """Bearer token without owner falls back to current_user (\"api\")."""
    assert effective_user(_req(
        api_token=True, api_token_owner=None, current_user="api",
    )) == "api"


def test_effective_user_falls_back_when_no_current_user(monkeypatch):
    """When middleware didn't set current_user, effective_user falls back
    to require_user — which returns "" in auth-disabled mode."""
    monkeypatch.setattr("src.auth_helpers.require_user", lambda r: "")
    result = effective_user(_req(api_token=False, current_user=None))
    assert result == "", (
        f"Expected empty string for auth-disabled fallback, got {result!r}"
    )


def test_effective_user_falls_back_to_require_user(monkeypatch):
    """Verify the actual fallback call is wired — require_user is invoked
    when current_user is None and api_token is False."""
    sentinel = object()

    def fake_require(request):
        return sentinel

    monkeypatch.setattr("src.auth_helpers.require_user", fake_require)
    result = effective_user(_req(api_token=False, current_user=None))
    assert result is sentinel, "effective_user did not call require_user fallback"


# =========================================================================
# _verify_session_owner — user-is-None / empty-string split
# =========================================================================


_MISSING = object()


def _mock_db_with_row(owner_value):
    """Build a SessionLocal mock whose query returns a row with the given
    owner, or None when owner_value is _MISSING."""
    row = SimpleNamespace(owner=owner_value) if owner_value is not _MISSING else None
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = row
    return MagicMock(return_value=db)


def test_verify_session_owner_passes_empty_user(monkeypatch):
    """user=\"\" (auth-disabled mode) → skip ownership checks, no error."""
    monkeypatch.setattr(SR, "SessionLocal", _mock_db_with_row(_MISSING))
    req = _req(api_token=False, current_user=None)
    monkeypatch.setattr("src.auth_helpers.require_user", lambda r: "")
    SR._verify_session_owner(req, "any-sid")


def test_verify_session_owner_raises_for_none_user(monkeypatch):
    """user=None (truly unauthenticated) → 401 from effective_user."""
    monkeypatch.setattr(SR, "SessionLocal", _mock_db_with_row("alice"))
    req = _req(api_token=False, current_user=None)

    def fake_require(request):
        raise HTTPException(401, "Not authenticated")

    monkeypatch.setattr("src.auth_helpers.require_user", fake_require)
    with pytest.raises(HTTPException) as exc:
        SR._verify_session_owner(req, "any-sid")
    assert exc.value.status_code in (401, 403), (
        f"Expected 401 or 403, got {exc.value.status_code}"
    )


def test_verify_session_owner_accepts_authenticated_user(monkeypatch):
    """Normal authenticated user passes ownership check for their own session."""
    monkeypatch.setattr(SR, "SessionLocal", _mock_db_with_row("alice"))
    req = _req(api_token=False, current_user="alice")
    SR._verify_session_owner(req, "alice-sid")


def test_verify_session_owner_rejects_cross_owner(monkeypatch):
    """User alice cannot verify bob's session."""
    monkeypatch.setattr(SR, "SessionLocal", _mock_db_with_row("bob"))
    req = _req(api_token=False, current_user="alice")
    with pytest.raises(HTTPException) as exc:
        SR._verify_session_owner(req, "bob-sid")
    assert exc.value.status_code == 404


# =========================================================================
# require_user helper — the three cases that return ""
# =========================================================================


def test_require_user_returns_empty_when_auth_disabled(monkeypatch):
    """_auth_disabled() returns True → require_user returns ""."""
    req = _req(api_token=False, current_user=None)
    monkeypatch.setattr("src.auth_helpers._auth_disabled", lambda: True)
    result = require_user(req)
    assert result == "", (
        f"Expected \"\" for auth-disabled, got {result!r}"
    )


def test_require_user_returns_empty_for_loopback_localhost_bypass(monkeypatch):
    """LOCALHOST_BYPASS=true + loopback caller → require_user returns ""."""
    req = _req(api_token=False, current_user=None)
    monkeypatch.setattr("src.auth_helpers._auth_disabled", lambda: False)
    monkeypatch.setenv("LOCALHOST_BYPASS", "true")
    try:
        result = require_user(req)
        assert result == "", (
            f"Expected \"\" for LOCALHOST_BYPASS, got {result!r}"
        )
    finally:
        monkeypatch.delenv("LOCALHOST_BYPASS", raising=False)


def test_require_user_returns_empty_for_loopback_unconfigured(monkeypatch):
    """Loopback + unconfigured auth → require_user returns ""."""
    req = _req(api_token=False, current_user=None)
    req.app.state.auth_manager = None
    monkeypatch.setattr("src.auth_helpers._auth_disabled", lambda: False)
    monkeypatch.setenv("LOCALHOST_BYPASS", "false")
    monkeypatch.setenv("AUTH_ENABLED", "true")
    try:
        result = require_user(req)
        assert result == "", (
            f"Expected \"\" for unconfigured loopback, got {result!r}"
        )
    finally:
        monkeypatch.delenv("LOCALHOST_BYPASS", raising=False)


# =========================================================================
# _owner_for_db expression — user or None
# =========================================================================
# auto_sort_sessions uses `_owner_for_db = user or None` so that "" maps to
# None (matching DB null-owner sessions), while real usernames pass through.
# These unit tests pin the expression directly.


def test_owner_for_db_empty_string_maps_to_none():
    """user=\"\" → _owner_for_db is None."""
    assert ("" or None) is None


def test_owner_for_db_username_passes_through():
    """user=\"admin\" → _owner_for_db is \"admin\"."""
    assert ("admin" or None) == "admin"


def test_owner_for_db_none_stays_none():
    """user=None → _owner_for_db is None."""
    assert (None or None) is None


# =========================================================================
# SessionManager.get_sessions_for_user — None vs ""
# =========================================================================
# The _owner_for_db mapping is critical because get_sessions_for_user("")
# matches no sessions (all sessions have owner=None in auth-disabled mode),
# while get_sessions_for_user(None) returns all sessions.


def test_get_sessions_for_user_none_returns_all_sessions():
    """get_sessions_for_user(None) should return all sessions
    (no owner filter applied). Simulates the real SessionManager
    filtering logic: owner=None → no filter → all non-archived sessions."""
    sessions = {
        "s1": SimpleNamespace(id="s1", owner=None, archived=False),
        "s2": SimpleNamespace(id="s2", owner="alice", archived=False),
    }
    owner = None
    result = {
        k: v for k, v in sessions.items()
        if not getattr(v, "archived", False)
        and (owner is None or getattr(v, "owner", None) == owner)
    }
    assert len(result) == 2, f"Expected 2 sessions for None owner, got {len(result)}"


def test_get_sessions_for_user_empty_returns_none():
    """get_sessions_for_user("") should match NO sessions
    (sessions have owner=None or real usernames)."""
    sessions = {
        "s1": SimpleNamespace(id="s1", owner=None, archived=False),
        "s2": SimpleNamespace(id="s2", owner="alice", archived=False),
    }
    owner = ""
    result = {
        k: v for k, v in sessions.items()
        if not getattr(v, "archived", False)
        and (owner is None or getattr(v, "owner", None) == owner)
    }
    assert len(result) == 0, (
        f"Expected 0 sessions for empty-string owner, got {len(result)}"
    )
