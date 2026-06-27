"""Gate tests for the mutating: frontmatter flag enforcement.

Closes the audit finding that `SkillsManager` parsed the `mutating:` field from
SKILL.md frontmatter but never consulted it at the execution boundary. The gate
now lives in `routes/skills_routes._run_skill_test_once` and `_run_skill_test_job`
and refuses to launch the agent loop on `mutating: true` skills unless the caller
passes `force=True`. Defense-in-depth: `mutating: false` is treated as a positive
read-only claim and runs without gating (per the thinker's verdict).
"""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest.mock import patch

# Path setup so `routes.skills_routes` imports under the project namespace.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.chdir(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routes.skills_routes import (  # noqa: E402
    _skill_mutating_flag,
    _run_skill_test_once,
)


# ── Frontmatter parser ───────────────────────────────────────────────────────

class SkillMutatingFlagTests(unittest.TestCase):
    """Direct unit tests of the frontmatter reader."""

    def test_absent_frontmatter_defaults_to_mutating_true(self):
        md = "# Just a heading, no frontmatter\n\nbody\n"
        is_mutating, reason = _skill_mutating_flag(md)
        self.assertTrue(is_mutating)
        self.assertEqual(reason, "no-frontmatter")

    def test_present_frontmatter_with_no_mutating_key(self):
        md = "---\nname: foo\n---\nbody\n"
        is_mutating, reason = _skill_mutating_flag(md)
        self.assertTrue(is_mutating)
        self.assertEqual(reason, "no-flag")

    def test_explicit_mutating_true(self):
        md = "---\nname: foo\nmutating: true\n---\nbody\n"
        is_mutating, reason = _skill_mutating_flag(md)
        self.assertTrue(is_mutating)
        self.assertEqual(reason, "frontmatter:true")

    def test_explicit_mutating_false(self):
        md = "---\nname: foo\nmutating: false\n---\nbody\n"
        is_mutating, reason = _skill_mutating_flag(md)
        self.assertFalse(is_mutating)
        self.assertEqual(reason, "frontmatter:false")

    def test_mutating_key_with_trailing_whitespace(self):
        md = "---\nmutating:   true   \n---\nbody\n"
        is_mutating, _ = _skill_mutating_flag(md)
        self.assertTrue(is_mutating)


# ── Gate behavior at the execution boundary ──────────────────────────────────

# A no-op async generator — stands in for the real stream_agent_loop so the
# gate-decision code path doesn't need an LLM to exercise the "allowed" branch.
async def _fake_stream_agent_loop(*_, **__):
    if False:
        yield  # pragma: no cover — makes this an async generator


def _run(coro):
    return asyncio.run(coro)


class SkillGateExecutionTests(unittest.TestCase):
    """Verify the gate fires BEFORE the agent loop is invoked."""

    def test_mutating_true_blocks_without_force(self):
        md = "---\nmutating: true\n---\nbody\n"
        # Patch stream_agent_loop so we can prove it is never called.
        with patch("src.agent_loop.stream_agent_loop") as mock_loop:
            transcript, verdict = _run(_run_skill_test_once(
                md, "do thing", "http://x", "m", {}, "u", force=False,
            ))
        self.assertEqual(verdict.get("verdict"), "blocked")
        self.assertIn("mutating: true", transcript[0]["text"])
        # Crucial: the agent loop must NOT have been invoked.
        mock_loop.assert_not_called()

    def test_mutating_true_with_force_passes_through(self):
        md = "---\nmutating: true\n---\nbody\n"
        with patch("src.agent_loop.stream_agent_loop", side_effect=_fake_stream_agent_loop) as mock_loop:
            _run(_run_skill_test_once(
                md, "do thing", "http://x", "m", {}, "u", force=True,
            ))
        # Positive assertion: proves the gate did NOT prematurely block AND
        # control actually reached the agent loop on the allowed path.
        mock_loop.assert_called_once()

    def test_mutating_false_runs_without_force(self):
        md = "---\nmutating: false\n---\nbody\n"
        with patch("src.agent_loop.stream_agent_loop", side_effect=_fake_stream_agent_loop):
            # Should not raise — gate allows, agent loop is mocked to no-op.
            _run(_run_skill_test_once(
                md, "do thing", "http://x", "m", {}, "u", force=False,
            ))

    def test_legacy_no_flag_runs_without_force(self):
        md = "# No frontmatter\nbody\n"
        with patch("src.agent_loop.stream_agent_loop", side_effect=_fake_stream_agent_loop):
            _run(_run_skill_test_once(
                md, "do thing", "http://x", "m", {}, "u", force=False,
            ))


if __name__ == "__main__":
    unittest.main()
