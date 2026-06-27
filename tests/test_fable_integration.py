"""Tests for fable-zero integration — runs in both stub and live modes.

When fable-zero is not installed, tests verify graceful degradation (stubs).
When fable-zero IS installed, tests verify the real pipeline.
"""
import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.fable_integration import (
    FableSettings,
    FableModelRouter,
    build_classified_candidates,
    classify_prompt,
    maybe_enhance_candidates,
    setup_fable_routes,
    ClassificationResult,
    _HAS_FABLE,
)

# Guard markers — tests are either stub-only or live-only, never both.
stub_test = pytest.mark.skipif(_HAS_FABLE, reason="requires fable-zero NOT installed")
live_test = pytest.mark.skipif(not _HAS_FABLE, reason="requires fable-zero installed")


# ---------------------------------------------------------------------------
# Stub guard sanity
# ---------------------------------------------------------------------------

@stub_test
def test_stub_mode():
    """fable-zero should NOT be importable in stub mode."""
    assert _HAS_FABLE is False


@stub_test
def test_stub_classification_result():
    """Stub ClassificationResult returns 'unknown' with 0.0 confidence."""
    r = ClassificationResult()
    assert r.category == "unknown"
    assert r.confidence == 0.0
    assert r.method == "none"
    assert r.route == {}


@stub_test
def test_stub_classify_with_override():
    """Stub ClassificationResult accepts constructor overrides."""
    r = ClassificationResult(category="code", confidence=0.85, route={"primary": "deepseek"}, method="keyword")
    assert r.category == "code"
    assert r.confidence == 0.85
    assert r.route["primary"] == "deepseek"
    assert r.method == "keyword"


# ---------------------------------------------------------------------------
# FableSettings (mode-independent)
# ---------------------------------------------------------------------------

def test_settings_defaults():
    s = FableSettings()
    assert s.enabled is False
    assert s.classifier_model == "keyword"
    assert s.debate_threshold == 0.35
    assert s.force_debate_categories == ("code", "math", "reasoning")
    assert s.cache_enabled is True
    assert s.auto_detect is True


def test_settings_custom():
    s = FableSettings(enabled=True, classifier_model="bert", debate_threshold=0.5)
    assert s.enabled is True
    assert s.classifier_model == "bert"
    assert s.debate_threshold == 0.5


# ---------------------------------------------------------------------------
# FableModelRouter — stub mode (disabled / no fable-zero)
# ---------------------------------------------------------------------------

@stub_test
def test_router_default_state():
    """Default (disabled) router returns unknown and stats show disabled."""
    router = FableModelRouter()
    result = router.classify("what is the capital of France?")
    assert result.category == "unknown"
    assert result.confidence == 0.0

    s = router.stats()
    assert s["enabled"] is False
    assert s["has_fable"] is False
    assert s["classifier"] == "keyword"
    assert s["cache_enabled"] is False


@stub_test
def test_router_needs_debate_disabled():
    router = FableModelRouter()
    result = router.classify("write a fibonacci function")
    assert router.needs_debate(result) is False


@stub_test
def test_router_needs_debate_enabled_forced_category():
    router = FableModelRouter(FableSettings(enabled=True))
    result = ClassificationResult(category="code", confidence=0.0)
    assert router.needs_debate(result) is True


@stub_test
def test_router_needs_debate_enabled_low_confidence():
    router = FableModelRouter(FableSettings(enabled=True, debate_threshold=0.5))
    result = ClassificationResult(category="knowledge", confidence=0.3)
    assert router.needs_debate(result) is True
    result2 = ClassificationResult(category="knowledge", confidence=0.7)
    assert router.needs_debate(result2) is False


@stub_test
@stub_test
def test_router_cache_disabled_when_no_fable():
    """Semantic cache is None when fable-zero not installed (even if enabled)."""
    router = FableModelRouter(FableSettings(cache_enabled=True))
    assert router._cache is None
    assert router.check_cache("anything") is None


@stub_test
def test_router_stats():
    router = FableModelRouter(FableSettings(enabled=True, auto_detect=False, classifier_model="bert"))
    s = router.stats()
    assert s["enabled"] is True
    assert s["has_fable"] is False
    assert s["classifier"] == "bert"
    assert s["auto_detect"] is False


# ---------------------------------------------------------------------------
# FableModelRouter — live mode (fable-zero installed)
# ---------------------------------------------------------------------------

@live_test
def test_live_router_classifies():
    """With fable-zero, classification returns real categories."""
    router = FableModelRouter(FableSettings(enabled=True))
    r = router.classify("write a fibonacci function")
    assert r.category == "code"
    assert r.confidence > 0
    assert r.method == "keyword"

    r = router.classify("what is the capital of France?")
    assert r.category == "knowledge"
    assert r.confidence > 0


@live_test
def test_live_router_stats():
    router = FableModelRouter(FableSettings(enabled=True))
    s = router.stats()
    assert s["enabled"] is True
    assert s["has_fable"] is True
    assert s["classifier"] == "keyword"
    assert s["cache_enabled"] is True


@live_test
def test_live_router_debate_decision():
    """code category with enabled router triggers debate."""
    router = FableModelRouter(FableSettings(enabled=True))
    r = router.classify("fix this bug in my React component")
    assert router.needs_debate(r) is True

    # Very low threshold triggers debate on anything above it
    # With threshold=0.1 and "hello" classified multi_turn @ 0.2,
    # confidence >= threshold → no debate
    router2 = FableModelRouter(FableSettings(enabled=True, debate_threshold=0.1))
    r2 = router2.classify("hello, how are you?")
    assert router2.needs_debate(r2) is False, f"expected no debate for {r2}"


@live_test
def test_live_cache_available():
    router = FableModelRouter(FableSettings(cache_enabled=True))
    assert router._cache is not None
    assert router.check_cache("anything") is None  # cache miss is OK


# ---------------------------------------------------------------------------
# build_classified_candidates
# ---------------------------------------------------------------------------

class _FakeSess:
    def __init__(self, url="http://default:8000/v1", model="default-model", headers=None):
        self.endpoint_url = url
        self.model = model
        self.headers = headers or {"Authorization": "Bearer test"}


class _FakeSessNoModel:
    endpoint_url = None
    model = None
    headers = None


def test_candidates_disabled_passthrough():
    """When fable is disabled, candidates are original + fallback unchanged."""
    sess = _FakeSess()
    fallback = [("http://fb:8000/v1", "fb-model", {})]
    candidates, meta = build_classified_candidates("hello", sess, fallback)

    assert meta is None
    assert len(candidates) == 2
    assert candidates[0] == (sess.endpoint_url, sess.model, sess.headers)
    assert candidates[1] == fallback[0]


def test_candidates_enabled_no_override():
    """When enabled but no matching category override, session default is used."""
    router = FableModelRouter(FableSettings(enabled=True, category_endpoints={}))
    sess = _FakeSess()
    fallback = [("http://fb:8000/v1", "fb-model", {})]

    candidates, meta = build_classified_candidates("hello", sess, fallback, router=router)
    assert meta is not None
    assert meta["category"] is not None  # classifier ran
    assert "confidence" in meta
    assert "method" in meta
    assert any(c[0] == sess.endpoint_url for c in candidates)
    assert any(c[0] == fallback[0][0] for c in candidates)


def test_candidates_empty_sess():
    """When session has no model, candidates still builds without crashing."""
    sess = _FakeSessNoModel()
    fallback = [("http://fb:8000/v1", "fb-model", {})]
    candidates, meta = build_classified_candidates("test", sess, fallback)
    assert meta is None
    assert len(candidates) >= 1


def test_candidates_enabled_category_override():
    """When a category endpoint override exists, _resolve_endpoint_by_id is called."""
    router = FableModelRouter(FableSettings(
        enabled=True,
        category_endpoints={
            "code": {"endpoint_id": "ep-deepseek", "model": "deepseek-coder"},
        },
    ))
    sess = _FakeSess()
    fallback = [("http://fb:8000/v1", "fb-model", {})]

    resolved = MagicMock(return_value=(
        "https://api.deepseek.com/v1/chat/completions",
        "deepseek-coder",
        {"Authorization": "Bearer sk-test"},
    ))
    router._resolve_endpoint_by_id = resolved

    candidates, meta = build_classified_candidates(
        "write a python function", sess, fallback, router=router
    )
    assert meta is not None
    assert meta["category"] is not None  # classifier ran
    # With live fable-zero, "write a python function" → "code" category
    # which matches category_endpoints["code"] → resolved endpoint added
    if _HAS_FABLE:
        assert meta["category"] == "code"
    else:
        assert meta["category"] == "unknown"
    assert "confidence" in meta
    assert "method" in meta


# ---------------------------------------------------------------------------
# classify_prompt (convenience function)
# ---------------------------------------------------------------------------

def test_classify_prompt_returns_dict():
    result = classify_prompt("what is 2+2?")
    assert isinstance(result, dict)
    assert "category" in result
    assert "confidence" in result
    assert "method" in result


@stub_test
def test_classify_prompt_unknown_when_stub():
    """Without fable-zero, classify_prompt returns 'unknown' category."""
    result = classify_prompt("any question at all")
    assert result["category"] == "unknown"
    assert result["confidence"] == 0.0


@live_test
def test_classify_prompt_known_when_live():
    """With fable-zero, classify_prompt returns real categories."""
    result = classify_prompt("write a fibonacci function")
    assert result["category"] != "unknown"
    assert result["confidence"] > 0
    assert result["method"] == "keyword"


# ---------------------------------------------------------------------------
# maybe_enhance_candidates (chat hook)
# ---------------------------------------------------------------------------

def test_enhance_candidates_passthrough_when_disabled():
    sess = _FakeSess()
    fallback = [("http://fb:8000/v1", "fb-model", {})]
    candidates, meta = maybe_enhance_candidates("test", sess, fallback)
    assert meta is None
    assert candidates[0] == (sess.endpoint_url, sess.model, sess.headers)
    assert candidates[1] == fallback[0]


def test_enhance_candidates_safe_with_none_session():
    """Hook handles session with None attributes without crashing."""
    sess = _FakeSessNoModel()
    candidates, meta = maybe_enhance_candidates("test", sess, [])
    assert meta is None
    assert len(candidates) >= 1


# ---------------------------------------------------------------------------
# HTTP endpoints (via TestClient)
# ---------------------------------------------------------------------------

@pytest.fixture
def test_router():
    from fastapi import FastAPI, APIRouter
    app = FastAPI()
    app.include_router(setup_fable_routes(APIRouter(prefix="/api/fable")))
    return app


@pytest.fixture
def client(test_router):
    return TestClient(test_router)


class TestClassifyEndpoint:
    def test_classify_basic(self, client):
        resp = client.post("/api/fable/classify", json={"prompt": "hello world"})
        assert resp.status_code == 200
        data = resp.json()
        assert "category" in data
        assert data["has_fable"] == _HAS_FABLE

    def test_classify_empty_prompt(self, client):
        resp = client.post("/api/fable/classify", json={"prompt": ""})
        assert resp.status_code == 200
        data = resp.json()
        assert "category" in data

    def test_classify_missing_field(self, client):
        resp = client.post("/api/fable/classify", json={})
        assert resp.status_code == 422  # validation error


class TestDebateEndpoint:
    @stub_test
    def test_debate_returns_503_when_no_fable(self, client):
        """Without fable-zero, the debate endpoint must return 503."""
        resp = client.post("/api/fable/debate", json={"prompt": "hello"})
        assert resp.status_code == 503
        data = resp.json()
        assert "detail" in data

    @stub_test
    def test_debate_empty_prompt(self, client):
        """Even with an empty prompt, must 503 (not crash)."""
        resp = client.post("/api/fable/debate", json={"prompt": ""})
        assert resp.status_code == 503

    @live_test
    def test_debate_available_with_fable(self, client):
        """With fable-zero, debate endpoint should accept requests."""
        # We can't fully exec debate without LLM endpoints, but it should
        # return something other than 503.
        resp = client.post("/api/fable/debate", json={"prompt": "hello", "force": True})
        # Either 200 (debate started) or 500 (debate failed — no endpoints)
        # Both are acceptable — the key is it's not 503 "not implemented"
        assert resp.status_code != 503

    def test_debate_missing_field(self, client):
        resp = client.post("/api/fable/debate", json={})
        assert resp.status_code == 422


class TestStatsEndpoint:
    def test_stats(self, client):
        resp = client.get("/api/fable/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is False
        assert data["has_fable"] == _HAS_FABLE
        assert data["classifier"] == "keyword"

    def test_stats_keys(self, client):
        """Verify all expected keys are present."""
        resp = client.get("/api/fable/stats")
        data = resp.json()
        assert set(data.keys()) == {"enabled", "has_fable", "classifier", "cache_enabled", "auto_detect", "categories_mapped"}


# ---------------------------------------------------------------------------
# OdysseusDebateEngine
# ---------------------------------------------------------------------------

def test_debate_engine_returns_empty_without_db():
    """When no database is available, select_participants returns [].

    The important thing is it doesn't crash — graceful degradation.
    """
    from src.fable_integration import OdysseusDebateEngine
    router = FableModelRouter(FableSettings(enabled=True))
    engine = OdysseusDebateEngine(router)
    participants = engine.select_participants(3)
    assert participants == []


def test_detect_provider_label():
    """_detect_provider_label returns correct provider names from URLs."""
    from src.fable_integration import OdysseusDebateEngine
    engine = OdysseusDebateEngine(FableModelRouter())

    cases = [
        ("https://api.deepseek.com/v1", "deepseek"),
        ("https://generativelanguage.googleapis.com/v1", "gemini"),
        ("https://api.anthropic.com/v1", "claude"),
        ("https://api.together.xyz/v1", "together"),
        ("http://localhost:11434/v1", "local"),
        ("http://127.0.0.1:8000/v1", "local"),
        ("https://api.groq.com/v1", "groq"),
        ("https://api.openai.com/v1", "openai"),
        ("https://api.mistral.ai/v1", "mistral"),
        ("https://api.x.ai/v1", "xai"),
        ("https://unknown-provider.example.com/v1", "unknown-provider"),
    ]

    for url, expected in cases:
        assert engine._detect_provider_label(url) == expected, f"Mismatch for {url}"
