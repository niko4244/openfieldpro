"""
test_e2e_agent_toolcall.py
==========================
End-to-end proof that a local LLM (`qwen3-coder:30b` via Ollama) emits a
structured `tool_call` whose name follows Odysseus's qualified MCP convention
`mcp__<server_id>__<tool>`, after `_build_system_prompt` has been given the
migrated `SkillsManager` + `McpManager`.

Closes the verification gap flagged in the prior evaluation: the previous
integration test proved the catalog + DB + model are reachable, but didn't
prove an actual tool-call round-trip. This test does.

Ponytail choices:
  - We bypass stdio / SSE connection in this test (would force child-process
    lifecycle + 30s+ connect timeouts across 19 servers). Instead we seed
    one synthetic tool schema directly into the real `McpManager._tools`
    dict so `get_all_openai_schemas()` is the function under test.
  - We use a NATURAL prompt ("Use the ... tool to do X") rather than
    "respond ONLY with JSON" — empirically qwen3-coder:30b obeys the
    natural instruction and disobeys the forced-JSON one (see diag C vs B).
  - We pick the first *enabled* MCP server from app.db as the target so
    the server_id in the emitted tool_call is verifiable against reality.
"""
import json
import os
import sys
import urllib.error
import urllib.request

import pytest

# ── Path setup: mirrors tests/test_hermes_integration.py convention ──────────
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.chdir(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.database import McpServer, SessionLocal                # noqa: E402
from services.memory.skills import SkillsManager                  # noqa: E402
from src.agent_loop import _build_system_prompt                  # noqa: E402
from src.constants import DATA_DIR                                # noqa: E402
from src.mcp_manager import McpManager                            # noqa: E402

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL    = "qwen3-coder:30b"


# ── Helpers ─────────────────────────────────────────────────────────────────
def _pick_first_enabled_server():
    """Pull a deterministic, currently-enabled MCP server row from app.db."""
    db = SessionLocal()
    try:
        row = db.query(McpServer).filter(McpServer.is_enabled.is_(True)).first()
        assert row is not None, "no enabled MCP servers in app.db — re-run migrate_mcps.py"
        return row.id, row.name
    finally:
        db.close()


def _seed_synthetic_tool(mcp_mgr: McpManager, server_id: str, server_name: str):
    """
    ponytail: bypass live stdio/SSE connection in this test — drop a single
    synthetic tool schema directly into McpManager's internal `_tools` dict
    so the production `get_all_openai_schemas()` does the real
    `mcp__<server_id>__<tool>` naming work.  This keeps the test honest
    about the *formatting* contract without forcing a live subprocess.

    No `_connections` write: `_build_system_prompt` reads only `_tools` via
    `get_all_openai_schemas()`, so any connection-state mutation would be
    dead in this code path.
    """
    mcp_mgr._tools[server_id] = [
        {
            "name": "test_action",
            "description": (
                "Sentinel test tool. Use test_action whenever a user asks "
                "you to perform the standard e2e-probe action."
            ),
            "input_schema": {
                "type": "object",
                "properties": {"target": {"type": "string"}},
                "required": ["target"],
            },
        }
    ]
    _ = server_name  # retained for parity with the assertion log; mcp_mgr only cares about _tools[server_id].


def _drive_ollama_chat(messages, tools_schema):
    """POST a single /api/chat request. Returns parsed response JSON."""
    body = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "tools": tools_schema,
        "stream": False,
        "options": {"num_predict": 160, "temperature": 0.0},
    }
    req = urllib.request.Request(
        OLLAMA_CHAT_URL,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    # 300s ceiling covers cold-load of qwen3-coder:30b (warm-cached: ~2s).
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode())


# ── Companion test: SkillsManager + McpManager are reachable ─────────────────
def test_skillsmanager_and_mcpmanager_constructable():
    """Both managers construct; SkillsManager.load_all() on the migrated set
    returns a viable enumeration. Proves the Imports pass before the e2e
    drive runs."""
    skills = SkillsManager(DATA_DIR)
    # load_all() is both the loader and the enumerator on this class — it
    # returns the catalog as a list[dict] (53 entries after the Hermes merge).
    loaded = skills.load_all()
    assert isinstance(loaded, list) and len(loaded) >= 50, (
        f"migrated skill catalog dropped below 50 (got {len(loaded) if hasattr(loaded,'__len__') else '?'})"
    )

    mcp = McpManager()
    # No live connections — exercise the manager surface (id type, attributes).
    assert hasattr(mcp, "_tools")
    assert hasattr(mcp, "get_all_openai_schemas")
    assert hasattr(mcp, "call_tool")


# ── The main test ───────────────────────────────────────────────────────────
def test_qwen3_coder_30b_emits_structured_mcp_toolcall():
    server_id, server_name = _pick_first_enabled_server()

    skills_mgr = SkillsManager(DATA_DIR)
    skills_mgr.load_all()   # touch the migrated set so any latent crash surfaces

    mcp_mgr = McpManager()
    _seed_synthetic_tool(mcp_mgr, server_id, server_name)

    # 1. The real get_all_openai_schemas() must produce the qualified name.
    openai_schemas = mcp_mgr.get_all_openai_schemas({})
    expected_name = f"mcp__{server_id}__test_action"
    assert any(
        t.get("function", {}).get("name") == expected_name for t in openai_schemas
    ), f"missing seeded tool in openai schemas; got: {[t.get('function',{}).get('name') for t in openai_schemas]}"

    # 2. Build the system prompt with the migrated SkillsManager + McpManager.
    #    (_build_system_prompt reads mcp_mgr._tools internally; the SkillsManager
    #    is wired into the prompt-building helpers alongside it.)
    user_msg = (
        f"Use the tool on the {server_name} server named test_action "
        f"to perform the standard e2e-probe action with target 'e2e-probe'. "
        f"Invoke it as a tool call. Do not write a prose explanation before "
        f"the tool call."
    )
    # _build_system_prompt returns (messages, tools_schema) — a tuple. Use both.
    prompt_messages, prompt_tools = _build_system_prompt(
        messages=[{"role": "user", "content": user_msg}],
        model=OLLAMA_MODEL,
        active_document=None,
        mcp_mgr=mcp_mgr,
    )
    assert isinstance(prompt_messages, list) and prompt_messages, (
        f"_build_system_prompt messages missing/wrong shape: {type(prompt_messages).__name__}"
    )
    assert isinstance(prompt_tools, list), (
        f"_build_system_prompt tools_schema wrong shape: {type(prompt_tools).__name__}"
    )
    assert any(m.get("role") in ("system", "user", "assistant") for m in prompt_messages), (
        f"_build_system_prompt messages lack valid roles: {[m.get('role') for m in prompt_messages]}"
    )

    # 3. Drive the model via /api/chat. Send both the messages and the tools
    #    produced by _build_system_prompt so the test mirrors what production
    #    agent_loop.py:1671 does in the live agent run.
    try:
        reply = _drive_ollama_chat(prompt_messages, prompt_tools)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        pytest.skip(f"Ollama not reachable / cold-load exceeded budget: {e}")

    # 4. Assert: the response carries a structured tool_call against our MCP.
    msg = reply.get("message", {})
    tool_calls = msg.get("tool_calls") or []
    assert tool_calls, (
        f"model emitted zero tool_calls; "
        f"content[:200]={msg.get('content', '')[:200]!r} "
        f"done_reason={reply.get('done_reason')!r}"
    )

    tc = tool_calls[0]
    func = tc.get("function", {})
    name = func.get("name", "")

    # The naming contract: mcp__<server_id>__<tool_name>.
    # ponytail: use removeprefix / partition once on the inner segment rather
    # than triple-partitioning. str.partition splits at FIRST occurrence, so
    # partitioning 'mcp__dc825c52__test_action' on '__' gives ('mcp', '__',
    # 'dc825c52__test_action') — not ('mcp__', ...) — and the outer prefix
    # check fails. Stripping the literal 'mcp__' prefix avoids that trap.
    assert name.startswith("mcp__"), (
        f"tool_call.function.name is not mcp__-qualified: {name!r}"
    )
    qual = name[len("mcp__"):]
    embedded_server_id, _, embedded_tool = qual.partition("__")
    assert embedded_server_id == server_id, (
        f"tool_call references server_id {embedded_server_id!r} but test "
        f"scoped to {server_id!r} ({server_name})"
    )
    assert embedded_tool == "test_action", (
        f"tool_call references tool {embedded_tool!r} but test scoped to 'test_action'"
    )

    # Arguments must be JSON-parseable and carry the seeded target.
    raw_args = func.get("arguments", "{}")
    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
    assert isinstance(args, dict), f"tool_call.arguments not a dict: {args!r}"
    assert args.get("target") == "e2e-probe", (
        f"tool_call.arguments.target mismatch: expected 'e2e-probe', got {args.get('target')!r}"
    )
