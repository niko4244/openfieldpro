"""MCP URL liveness probe.

Asserts every is_enabled=1 row in app.db with a populated URL points at a TCP
port that returns a non-404 / non-5xx HTTP response within a few seconds.
Would have caught the gbrain SSE misconfig (id='gbrain', url=
'http://127.0.0.1:3131/sse') before any SSE-during-tool-call test tried to
use it, in BOTH CI (port has no listener -> TCP refused) and dev-machine
scenarios (port 3131 has a stray listener that 404s on /sse).

ponytail: TCP+HTTP probe (single GET, no body read). Cheaper than a full
requests/httpx integration and covers exactly the two misconfig shapes we
hit in practice: a port with no listener AND a port with a stranger service
that 404s on the target path. Retries are reserved for transport failures
only; HTTP responses (including 404 / 5xx) short-circuit to a final result
(server already answered, retrying won't change it).
Ceiling: Fails in CI (no port-3131 listener); locally with stray listeners,
run `netstat -tlnp | grep` first to confirm it's a definitive gate.
Stdio rows are out of scope (validated by test_e2e_real_mcp_execution via
real subprocess boot).
"""
import socket
import sqlite3
import ssl
import unittest
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

DB_PATH = Path(__file__).resolve().parent.parent / 'data' / 'app.db'
PROBE_TIMEOUT_SEC = 3.0
PROBE_RETRIES = 3
PROBE_WORKERS = 5


def _probe(url: str) -> tuple[bool, str]:
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        return False, 'no hostname in URL'
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    path = parsed.path or '/'
    if parsed.query:
        path += '?' + parsed.query
    request = (
        f'GET {path} HTTP/1.1\r\n'
        f'Host: {host}\r\n'
        f'Connection: close\r\n'
        f'User-Agent: mcp-url-liveness-probe/1.0\r\n'
        f'\r\n'
    ).encode('ascii')

    last_err = ''
    for _ in range(PROBE_RETRIES):
        sock = None
        buf = b''
        try:
            sock = socket.create_connection((host, port), timeout=PROBE_TIMEOUT_SEC)
            if parsed.scheme == 'https':
                sock = ssl.create_default_context().wrap_socket(sock, server_hostname=host)
            sock.sendall(request)
            sock.settimeout(PROBE_TIMEOUT_SEC)
            while b'\n' not in buf and len(buf) < 512:
                chunk = sock.recv(64)
                if not chunk:
                    break
                buf += chunk
        except Exception as e:
            last_err = f'{type(e).__name__}: {e}'
        finally:
            if sock is not None:
                sock.close()
        # Transport succeeded -- judge by status. `last_err` set means the
        # connection phase threw, retry-eligible.
        if last_err:
            continue
        if not buf:
            last_err = 'server closed without sending a status line'
            continue
        head = buf.split(b'\n', 1)[0].rstrip(b'\r')
        parts = head.split(b' ', 2)
        if len(parts) < 2:
            return False, f'malformed status line: {head!r}'
        try:
            status = int(parts[1])
        except ValueError:
            return False, f'non-numeric status: {parts[1]!r}'
        reason = parts[2].decode('latin-1', errors='replace').rstrip() if len(parts) >= 3 else ''
        msg = f'HTTP {status} {reason}'.strip()
        if status == 404 or status >= 500:
            return False, msg
        return True, msg
    return False, last_err or 'all retries failed'


class McpUrlLivenessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not DB_PATH.exists():
            raise unittest.SkipTest(f'app.db not found at {DB_PATH}; cannot probe.')

    def test_enabled_url_rows_have_live_url(self):
        with sqlite3.connect(DB_PATH) as con:
            rows = con.execute(
                "SELECT id, url FROM mcp_servers "
                "WHERE is_enabled=1 AND url IS NOT NULL AND url != ''"
            ).fetchall()

        if not rows:
            self.skipTest('no is_enabled=1 rows with a URL to probe.')

        failures = []
        with ThreadPoolExecutor(max_workers=PROBE_WORKERS) as pool:
            futures = {pool.submit(_probe, url): (id_, url) for id_, url in rows}
            for fut in as_completed(futures):
                id_, url = futures[fut]
                ok, msg = fut.result()
                if not ok:
                    failures.append(f'  [{id_}] {url} -> {msg}')

        if failures:
            self.fail('Enabled MCP servers returned 404 / 5xx / were unreachable:\n'
                      + '\n'.join(failures))


if __name__ == '__main__':
    unittest.main()
