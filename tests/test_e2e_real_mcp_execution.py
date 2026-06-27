"""Real-MCP end-to-end execution test.

Closes the next-level verification gap from the first e2e test (see
``test_e2e_agent_toolcall.py``): that test proved the *emission* half of the loop
— the model emitted ``mcp__<server_id>__<tool_name>`` with parseable JSON args.
This test proves the *execution* half — connect to a real stdio MCP server,
let the model emit a tool call, then call ``McpManager.call_tool(...)`` and
assert the result is non-empty.

Picks the filesystem MCP via ``npx -y @modelcontextprotocol/server-filesystem``
because it works on Windows + Linux + macOS without an extra install (npx
downloads on first invoke) and exposes a simple, well-known
``list_directory(path: str) -> str`` tool that the model can target reliably.
Skipped cleanly via :class:`unittest.SkipTest` if ``npx`` is not on PATH.

ponytail: the test directory is created in a tempfile under the system temp
dir, and the resulting deterministic filenames are what we assert against.
Ceiling: on hosts with read-only temp dirs the fixture falls back to the cwd.
Upgrade: use ``tempfile.TemporaryDirectory()`` as a context manager once we
move to pytest tmp_path.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import suppress
from pathlib import Path
from unittest.mock import patch# ── Path setup ───────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)
os.chdir(PROJECT_ROOT)

from src.mcp_manager import McpManager  # noqa: E402
import urllib.request  # noqa: E402


# ── Test fixtures ─────────────────────────────────────────────────────────────

# A deterministic, recognisable file set the model can list. The names are
# chosen so a misbehaving tool that returns sibling dirs can't accidentally
# "pass" by listing the wrong thing.
_PROBE_FILES = ("alpha.txt", "bravo.md", "charlot.json")


def _create_probe_dir() -> str:
    """Make a temp dir seeded with PROBE_FILES. Returns the directory path."""
    base = tempfile.mkdtemp(prefix="odysseus_e2e_fs_")
    for name in _PROBE_FILES:
        (Path(base) / name).write_text(f"e2e probe: {name}\n", encoding="utf-8")
    return base


# ── Model driver (reused pattern from the prior e2e test) ────────────────────

OLLAMA_URL = os.environ.get("ODYSSEUS_OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("ODYSSEUS_OLLAMA_MODEL", "qwen3-coder:30b")


async def _drive_model_to_emit_toolcall(server_id: str, tool_name: str,
                                        schema: dict, instruction: str,
                                        task_hint: str) -> dict | None:
    """Hit Ollama /api/chat with a tool schema and parse out the first tool call.

    Returns the parsed tool-call dict ``{"name": ..., "arguments": {...}}`` or
    ``None`` if the model did not emit one. Raises on transport failure.
    """
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": instruction},
            {"role": "user", "content": task_hint},
        ],
        "tools": [schema],
        "stream": False,
        "options": {"temperature": 0.0},
    }
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode("utf-8"))

    msg = body.get("message") or {}
    tcalls = msg.get("tool_calls") or []
    if not tcalls:
        return None
    fn = tcalls[0].get("function") or {}
    args = fn.get("arguments")
    if isinstance(args, str):
        with suppress(json.JSONDecodeError):
            args = json.loads(args)
    return {"name": fn.get("name", ""), "arguments": args or {}}


# ── The test ─────────────────────────────────────────────────────────────────

class RealMcpExecutionE2ETests(unittest.TestCase):
    """Spawn a real stdio MCP, drive Ollama, execute the tool, assert result."""

    SERVER_ID = "fs_e2e_probe"   # deterministic so model emission is predictable
    TOOL_NAME = "list_directory"

    @classmethod
    def setUpClass(cls) -> None:
        if shutil.which("npx") is None:
            raise unittest.SkipTest("npx not on PATH; filesystem MCP unavailable")
        try:
            urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=5).close()
        except Exception as e:  # noqa: BLE001 — surface context, not a stack
            raise unittest.SkipTest(f"Ollama not reachable at {OLLAMA_URL}: {e}")
        cls.probe_dir = _create_probe_dir()

    @classmethod
    def tearDownClass(cls) -> None:
        with suppress(OSError):
            shutil.rmtree(cls.probe_dir)

    def test_real_filesystem_mcp_runs_and_returns_probe_files(self):
        async def scenario():
            mgr = McpManager()
            try:
                # connect_server takes terminal-args shape (command, args, env),
                # NOT a StdioServerParameters object. The latter is internal to
                # _connect_stdio and gets re-built via stdio_client(params).
                await mgr.connect_server(
                    server_id=self.SERVER_ID,
                    name="filesystem",
                    transport="stdio",
                    command="npx",
                    args=["-y", "@modelcontextprotocol/server-filesystem", self.probe_dir],
                )
                # get_all_openai_schemas returns a FLAT LIST of OpenAI-shape
                # tool dicts keyed by the qualified mcp__<server_id>__<tool> name,
                # not a nested {server_id: {tool: schema}} dict.
                qualified_name = f"mcp__{self.SERVER_ID}__{self.TOOL_NAME}"
                flat = mgr.get_all_openai_schemas() or []
                tool_entry = next((s for s in flat if (s.get("name") == qualified_name or s.get("function", {}).get("name") == qualified_name)), None)
                self.assertIsNotNone(
                    tool_entry,
                    f"filesystem MCP did not expose list_directory; got names={[s.get('name') or s.get('function',{}).get('name') for s in flat]}",
                )
                fn_block = tool_entry.get("function", tool_entry)
                tool_schema = {
                    "description": fn_block.get("description", "list a directory"),
                    "parameters": fn_block.get("parameters", {}),
                }

                # Drive the model with the schema, asking it to list our probe dir.
                em = await _drive_model_to_emit_toolcall(
                    server_id=self.SERVER_ID,
                    tool_name=self.TOOL_NAME,
                    schema={
                        "type": "function",
                        "function": {
                            "name": qualified_name,
                            "description": tool_schema["description"],
                            "parameters": tool_schema["parameters"],
                        },
                    },
                    instruction=(
                        f"You MUST call the tool `{qualified_name}` "
                        f"exactly once with argument `path` set to the probe directory "
                        f"\"{self.probe_dir}\". No other tools. No prose."
                    ),
                    task_hint=f"List the files in {self.probe_dir}",
                )
                self.assertIsNotNone(em, "Model did not emit a tool call")
                self.assertEqual(
                    em["name"], f"mcp__{self.SERVER_ID}__{self.TOOL_NAME}",
                    f"Model emitted wrong tool name: {em['name']!r}",
                )

                # The execution half — pipe the model's emission through call_tool.
                result = await mgr.call_tool(em["name"], em["arguments"])
                self.assertIsInstance(result, dict, f"call_tool returned non-dict: {result!r}")
                self.assertNotIn(
                    "error", result,
                    f"call_tool errored: {result.get('error')!r}",
                )
                # exit_code guard — prevents a non-zero MCP exit (e.g. mid-tool
                # crash) from passing silently because stdout happens to mention a
                # probe filename. Catches the "data-with-error" failure mode.
                if "exit_code" in result:
                    self.assertEqual(result["exit_code"], 0,
                                     f"call_tool exit_code != 0; stderr={result.get('stderr')!r}")

                content = (result.get("content") or result.get("text")
                           or result.get("output") or result.get("stdout") or "")
                # content may be a list[dict] (mcp objects) or a plain string.
                serialized = json.dumps(content) if not isinstance(content, str) else content
                for name in _PROBE_FILES:
                    self.assertIn(
                        name, serialized,
                        f"Probe file {name!r} missing from filesystem MCP result; "
                        f"got: {serialized[:300]!r}",
                    )
            finally:
                # disconnect_server triggers the atexit-tracked SIGKILL path for
                # any straggler subprocesses (added in the prior atexit patch).
                with suppress(Exception):
                    await mgr.disconnect_server(self.SERVER_ID)

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
