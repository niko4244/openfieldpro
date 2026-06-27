"""Integration tests for the MoA debate pipeline — mock and live modes.

Tests validate:
1. Protocol flow (Round 1 → Round 2 → Round 3)
2. Edge cases (not enough participants, failed calls)
3. Synthesis quality (real models when available)
"""
import os
import time
from unittest.mock import MagicMock, patch

import pytest

from src.fable_integration import (
    FableSettings,
    FableModelRouter,
    OdysseusDebateEngine,
    _HAS_FABLE,
)

# ── Markers ──────────────────────────────────────────────────────────────────

live_test = pytest.mark.skipif(
    not _HAS_FABLE,
    reason="requires fable-zero installed (for real MixtureOfAgents)",
)
local_models = pytest.mark.skipif(
    not os.environ.get("PYTEST_RUN_LOCAL"),
    reason="set PYTEST_RUN_LOCAL=1 to run local model tests",
)


# ── Mock-based protocol validation ──────────────────────────────────────────

class TestDebateProtocolFlow:
    """Validate the 3-round debate protocol using mocked participants.

    These tests verify the debate logic (round management, fallbacks,
    synthesis) without requiring real LLM endpoints.
    """

    @pytest.fixture
    def engine(self):
        router = FableModelRouter(FableSettings(enabled=True))
        eng = OdysseusDebateEngine(router)
        return eng

    def test_participant_selection_empty(self, engine):
        """Without a database, participant selection returns empty list."""
        participants = engine.select_participants(3)
        assert participants == []

    def test_debate_with_no_participants(self, engine):
        """Debate with zero participants returns empty result gracefully."""
        result = engine.debate("test prompt")
        assert result["final_answer"] == ""
        assert result["participants"] == []
        assert result["debate_depth"] == 0
        assert "elapsed" in result

    def test_debate_with_one_participant(self, engine):
        """Single participant skips debate rounds and returns direct result."""
        with patch.object(
            engine, "select_participants", return_value=[
                {"name": "local", "url": "http://localhost:11434/v1",
                 "model": "qwen2.5:0.5b", "headers": {},
                 "label": "local (qwen2.5:0.5b)"},
            ]
        ):
            with patch.object(
                engine, "_call_model", return_value="Mock answer from local model"
            ):
                result = engine.debate("what is 2+2?")

        assert result["final_answer"] == "Mock answer from local model"
        assert result["participants"] == ["local (qwen2.5:0.5b)"]
        assert result["debate_depth"] == 0  # no rounds, just direct
        assert len(result["rounds"]) == 0

    def test_full_3round_debate(self, engine):
        """Full 3-round MoA debate with mocked participants."""
        participants = [
            {"name": "deepseek", "url": "https://api.deepseek.com/v1",
             "model": "deepseek-chat", "headers": {"Authorization": "Bearer key1"},
             "label": "deepseek (deepseek-chat)"},
            {"name": "gemini", "url": "https://generativelanguage.googleapis.com/v1",
             "model": "gemini-2.5-pro", "headers": {"Authorization": "Bearer key2"},
             "label": "gemini (gemini-2.5-pro)"},
            {"name": "local", "url": "http://localhost:11434/v1",
             "model": "qwen2.5:0.5b", "headers": {},
             "label": "local (qwen2.5:0.5b)"},
        ]

        # Each round returns distinct mocked responses
        round1_results = {
            "deepseek (deepseek-chat)": "DeepSeek: 2+2=4",
            "gemini (gemini-2.5-pro)": "Gemini: The answer is 4",
            "local (qwen2.5:0.5b)": "local: four",
        }

        def mock_select_participants(n):
            return participants[:n]

        call_count = [0]
        def mock_call_model(participant, messages, system=""):
            idx = call_count[0]
            call_count[0] += 1
            label = participant["label"]

            # Round 1: independent generation (3 calls)
            if idx < 3:
                return round1_results.get(label)
            # Round 2: cross-evaluation (3 calls)
            elif idx < 6:
                return f"{label} evaluates: Answer from deepseek is best because it's most direct."
            # Round 3: synthesis (1 call)
            else:
                return "Final synthesized answer: 2+2=4"

        with patch.object(engine, "select_participants", mock_select_participants):
            with patch.object(engine, "_call_model", mock_call_model):
                result = engine.debate("what is 2+2?")

        assert result["final_answer"] == "Final synthesized answer: 2+2=4"
        assert len(result["participants"]) == 3
        assert len(result["rounds"]) == 3
        assert result["debate_depth"] == 3

        # Check round structure
        r1, r2, r3 = result["rounds"]
        assert r1["round"] == 1
        assert r1["label"] == "independent_generation"
        assert len(r1["results"]) == 3

        assert r2["round"] == 2
        assert r2["label"] == "cross_evaluation"
        assert len(r2["results"]) == 3

        assert r3["round"] == 3
        assert r3["label"].startswith("synthesis_")

    def test_debate_round2_fallback(self, engine):
        """When round 2 (cross-evaluation) produces no results, use best R1."""
        participants = [
            {"name": "deepseek", "url": "https://api.deepseek.com/v1",
             "model": "deepseek-chat", "headers": {},
             "label": "deepseek (deepseek-chat)"},
            {"name": "gemini", "url": "https://generativelanguage.googleapis.com/v1",
             "model": "gemini-2.5-pro", "headers": {},
             "label": "gemini (gemini-2.5-pro)"},
        ]

        def mock_select_participants(n):
            return participants[:n]

        call_round = [0]
        def mock_call_model(participant, messages, system=""):
            call_round[0] += 1
            label = participant["label"]
            # Round 1 works
            if call_round[0] <= 2:
                return {
                    "deepseek (deepseek-chat)": "DeepSeek answer",
                    "gemini (gemini-2.5-pro)": "Gemini answer",
                }.get(label)
            # Round 2 returns None (all fail)
            return None

        with patch.object(engine, "select_participants", mock_select_participants):
            with patch.object(engine, "_call_model", mock_call_model):
                result = engine.debate("test")

        # Should fallback to best R1 answer
        assert result["final_answer"] in ("DeepSeek answer", "Gemini answer")
        assert result["debate_depth"] == 3  # still completed 3 rounds
        assert result["rounds"][2]["label"] == "fallback_best_r1"

    def test_debate_with_only_one_r1_result(self, engine):
        """When only one model responds in R1, skip to direct answer."""
        participants = [
            {"name": "deepseek", "url": "https://api.deepseek.com/v1",
             "model": "deepseek-chat", "headers": {},
             "label": "deepseek (deepseek-chat)"},
            {"name": "gemini", "url": "https://generativelanguage.googleapis.com/v1",
             "model": "gemini-2.5-pro", "headers": {},
             "label": "gemini (gemini-2.5-pro)"},
        ]

        call_count = [0]
        def mock_call_model(participant, messages, system=""):
            call_count[0] += 1
            # Only deepseek responds
            if "deepseek" in participant["name"]:
                return "DeepSeek says hello"
            return None

        with patch.object(engine, "select_participants", return_value=participants):
            with patch.object(engine, "_call_model", mock_call_model):
                result = engine.debate("hello")

        assert result["final_answer"] == "DeepSeek says hello"
        # Skip round 2 (not enough results), round 3 is direct
        assert result["debate_depth"] == 1
        # R1 results present, then a fallback
        assert len(result["rounds"]) == 1

    def test_detect_provider_labels(self, engine):
        """Provider detection from URLs works correctly."""
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
            assert engine._detect_provider_label(url) == expected, f"Failed for {url}"


# ── Real-model validation (requires Ollama or API keys) ───────────────────

@pytest.fixture(scope="module")
def real_moa():
    """Create a MixtureOfAgents instance with whatever models are available."""
    from fable_zero.mixture_agent import MixtureOfAgents
    moa = MixtureOfAgents(verbose=True)
    return moa


@local_models
def test_moa_direct_route_with_local_model(real_moa):
    """Direct routing with a real local model (if available).

    This validates that real HTTP calls to Ollama work through the
    MoA pipeline. Skipped by default; run with PYTEST_RUN_LOCAL=1.
    """
    assert len(real_moa.models) >= 1, "Need at least one model"
    # Use a unique prompt to avoid cache
    import time as _t
    result = real_moa.answer(
        f"What is 2+2? Answer in one word. (t={_t.time():.0f})",
        force_debate=False,
    )
    assert result.final_answer, "Should get a real response"
    assert result.model_used != "none" and result.model_used != "cache", \
        f"Expected model response, got cache: {result}"
    assert result.debate_depth == 1  # direct route
    assert result.total_elapsed > 0


@local_models
def test_moa_full_debate_with_local_model(real_moa):
    """Full MoA debate with real model calls.

    With only one model available, this tests that same-model
    cross-evaluation works (model generates, evaluates itself,
    then synthesizes).

    NOTE: With a single model, full_debate falls through to the
    "only one model responded" path after R1. This still validates:
    - Real API calls succeed
    - The pipeline doesn't crash
    - Timing is measured correctly
    """
    assert len(real_moa.models) >= 1, "Need at least one model"
    import time as _t
    result = real_moa.answer(
        f"What is the capital of France? Answer in one word. (t={_t.time():.0f})",
        force_debate=True,
    )
    assert result.final_answer, "Should get a real response"
    assert result.total_elapsed > 0

    # With 1 model, full_debate runs R1 (it's the only participant)
    # The other rounds may be skipped due to not enough responses
    assert result.debate_depth >= 1


@local_models
def test_moa_cache_functionality(real_moa):
    """Semantic cache prevents redundant API calls."""
    prompt = "What is the boiling point of water? Answer in Celsius."

    # First call (cold cache)
    result1 = real_moa.answer(prompt, force_debate=False)
    assert result1.final_answer
    first_elapsed = result1.total_elapsed

    # Second call (should be cached)
    result2 = real_moa.answer(prompt, force_debate=False)
    assert result2.final_answer
    assert result2.model_used == "cache"
    assert result2.total_elapsed == 0


# ── Command-line debate runner ────────────────────────────────────────────

if __name__ == "__main__":
    """Run a quick debate on the command line.

    Usage:
        python tests/test_debate_pipeline.py "What is the meaning of life?"
    """
    import sys
    prompt = sys.argv[1] if len(sys.argv) > 1 else "What is 2+2?"

    print(f"\n{'='*60}")
    print(f"MoA Debate Pipeline — Real Model Validation")
    print(f"{'='*60}")
    print(f"\nPrompt: {prompt}\n")

    from fable_zero.mixture_agent import MixtureOfAgents
    moa = MixtureOfAgents(verbose=True)
    print(f"Models available: {list(moa.models.keys())}")

    if not moa.models:
        print("No models available. Set API keys (DEEPSEEK_API_KEY, "
              "GEMINI_API_KEY) or start Ollama with a model.")
        sys.exit(1)

    print("\n--- Direct Route ---")
    result = moa.answer(prompt, force_debate=False)
    print(f"Model: {result.model_used}")
    print(f"Time: {result.total_elapsed:.1f}s")
    print(f"Answer: {result.final_answer[:200]}")
    print(f"Debate depth: {result.debate_depth}")

    if len(moa.models) >= 1:
        print("\n--- Full Debate ---")
        result = moa.answer(prompt, force_debate=True)
        print(f"Model: {result.model_used}")
        print(f"Time: {result.total_elapsed:.1f}s")
        print(f"Rounds: {len(result.rounds)}")
        print(f"Answer: {result.final_answer[:200]}")
        print(f"Debate depth: {result.debate_depth}")

    print(f"\n{'='*60}")
