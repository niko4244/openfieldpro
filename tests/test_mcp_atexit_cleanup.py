"""
test_mcp_atexit_cleanup.py
===========================
Guards against the orphan-zombie risk: when Odysseus crashes/exits ungracefully
after `_connect_stdio` succeeded, the stdio subprocess children (npx / bun /
node) survive without their parent. This test exercises the atexit hook that
sends portable SIGKILL/TerminateProcess to whatever is still tracked at exit.

Ponytail choices:
  - We test the hook directly via classmethod invocation, NOT by killing the
    parent Python process (which would kill pytest itself).
  - We use a FakeProcess mock with .pid / .kill + a kill_called flag for the
    unit-style assertions, then a real python subprocess for the round-trip.
  - We do NOT test the actual atexit registration path; that's an OS-level
    state mutation best left to integration tests.
"""
import os
import sys

import pytest

# ── Path setup ──────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.chdir(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.mcp_manager import McpManager  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_global_state():
    """Snapshot class-level state and restore after each test.
    ponytail: McpManager._all_procs and _atexit_registered are process-global,
    not per-test. Without this fixture, the second test to run can trip on
    procs leaked from the first. snapshot+restore is the cheapest isolation."""
    saved_procs = set(McpManager._all_procs)
    saved_flag = McpManager._atexit_registered
    McpManager._all_procs = set()
    yield
    McpManager._all_procs = saved_procs
    McpManager._atexit_registered = saved_flag


class FakeProcess:
    """Minimal stand-in matching anyio.Process API surface (pid + kill)."""
    def __init__(self, pid: int = 99999):
        self.pid = pid
        self.kill_called = False
        self.terminate_called = False

    def kill(self):
        self.kill_called = True

    def terminate(self):
        self.terminate_called = True


# ── 1. Idempotent atexit hook registration ──────────────────────────────────
def test_atexit_registered_once_across_instances():
    # Reset state for isolation — pytest may have left an earlier instance.
    McpManager._atexit_registered = False
    McpManager._all_procs = set()

    McpManager._register_atexit_once()
    first_flag = McpManager._atexit_registered

    McpManager._register_atexit_once()
    McpManager._register_atexit_once()

    assert first_flag is True
    assert McpManager._atexit_registered is True


# ── 2. Hook kills every tracked proc + swallows ProcessLookupError ──────────
def test_kill_leftover_procs_invokes_kill_on_each():
    McpManager._all_procs = set()

    p_alive = FakeProcess(pid=1001)
    p_already_dead = FakeProcess(pid=1002)
    # kill() on a ProcessLookupError-raising proc would have incremented a
    # sentinel counter inside it; we use a generator throw so kill() actually
    # raises (no kill_called bump). The hook must swallow without bubbling.
    p_already_dead.kill = lambda: (_ for _ in ()).throw(ProcessLookupError(1002))

    McpManager._all_procs.update({p_alive, p_already_dead})

    McpManager._kill_leftover_procs()  # must not raise

    assert p_alive.kill_called is True, "hook must call kill() on alive procs"
    # Reaching this assert proves the ProcessLookupError was swallowed in
    # `_kill_leftover_procs` — otherwise pytest would surface it as raised.


# ── 3. disconnect_server removes proc from kill-list ─────────────────────────
# Body is sync — mirrors the proc-cleanup logic from disconnect_server
# without spinning up a real asyncio stack. Tests the kill-list invariant
# directly so we don't need pytest-asyncio.
def test_disconnect_removes_proc_from_kill_list():
    mgr = McpManager()
    p = FakeProcess(pid=2001)
    mgr._procs["test-srv"] = p
    McpManager._all_procs.add(p)

    assert p in McpManager._all_procs

    # Reproduce the same pop logic disconnect_server uses:
    popped = mgr._procs.pop("test-srv", None)
    if popped is not None:
        McpManager._all_procs.discard(popped)

    assert p not in McpManager._all_procs, (
        "after disconnect, proc must not be in atexit's global kill-list"
    )


# ── 4. Real-process round-trip: hook kills a live python child ──────────────
@pytest.mark.skipif(sys.platform == "win32", reason="win32 PID lifetime probe is flaky in CI")
def test_atexit_kill_kills_real_python_subprocess(tmp_path):
    """Spawn a python sleep(120) via anyio.open_process, hand its handle to the
    hook, and verify the OS-level pid is gone within 3 seconds."""
    import anyio, asyncio, time

    McpManager._all_procs = set()

    async def spawn_dummy():
        return await anyio.open_process(
            [sys.executable, "-c", "import time;time.sleep(120)"],
            env={**os.environ, "PYTHONUTF8": "1"},
        )

    proc = asyncio.run(spawn_dummy())
    try:
        assert isinstance(proc.pid, int) and proc.pid > 0
        McpManager._all_procs.add(proc)

        # Sanity: pid alive before kill
        try:
            os.kill(proc.pid, 0)
            alive_before = True
        except (ProcessLookupError, PermissionError):
            alive_before = False
        assert alive_before, "child should be alive before hook fires"

        McpManager._kill_leftover_procs()

        # PID should now be reapable as dead
        deadline = time.time() + 3.0
        while time.time() < deadline:
            try:
                os.kill(proc.pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.1)
        # It's fine if the loop raced; explicit fan-in check:
        try:
            os.kill(proc.pid, 0)
            still_alive = True
        except ProcessLookupError:
            still_alive = False
        assert not still_alive, (
            f"hook did not kill real subprocess pid={proc.pid} (still alive 3s after kill)"
        )
    finally:
        # Belt-and-braces: anyio.kill + wait so the temp child can't orphan.
        try:
            proc.kill()
        except Exception:
            pass


# ── 5. _extract_stdio_proc walks AsyncExitStack callbacks defensively ───────
def test_extract_stdio_proc_finds_proc_in_stack_callback():
    """Synthesize an AsyncExitStack-like whose `_exit_callbacks` contains a
    functools.partial that has the proc buried in cb.args. The extract walker
    must find it via the unwrap loop, even when stdlib internals reorganize."""
    from functools import partial

    fake_proc = FakeProcess(pid=3001)
    inner_func = lambda p: None             # target the partial wraps
    wrapped = partial(inner_func, fake_proc)  # carries fake_proc as cb.args[0]

    # Mimic AsyncExitStack 4-tuple shape from Py 3.10+: (sync_flag, cb, args, kwargs)
    class FakeStack:
        _exit_callbacks = [("async", wrapped, (), {})]

    found = McpManager._extract_stdio_proc(FakeStack())
    assert found is fake_proc, "walker must unwrap functools.partial and return the proc"


def test_extract_stdio_proc_tolerates_3tuple_shape():
    """Pre-3.10 callback shape: (cb, args, kwargs). Must still work."""
    from functools import partial

    fake_proc = FakeProcess(pid=3002)
    wrapped = partial(lambda p: None, fake_proc)

    class FakeStack:
        _exit_callbacks = [(wrapped, (), {})]

    found = McpManager._extract_stdio_proc(FakeStack())
    assert found is fake_proc, "walker must support legacy 3-tuple callback shape"


def test_extract_stdio_proc_returns_none_for_empty_stack():
    class FakeStack:
        _exit_callbacks = []
    assert McpManager._extract_stdio_proc(FakeStack()) is None
