# Odysseus — AI Workspace

## Tech Stack

**Backend**
- Python 3.11+, FastAPI, uvicorn
- SQLAlchemy (SQLite default, `.env` for Postgres)
- ChromaDB (vector memory + RAG)
- FastEmbed (ONNX) for local embeddings
- httpx, aiohttp, websockets

**Frontend**
- Vanilla JS (ES modules, no build step, no framework)
- Single `static/index.html` SPA (~200KB) with modular `static/js/*.js`
- Server-rendered HTML with CSP nonce injection
- KaTeX (math rendering), Mermaid (diagrams), highlight.js (code)
- Self-hosted Inter font (no Google CDN dependency)
- PWA with service worker, manifest, offline-capable

**Infrastructure**
- Docker Compose (Odysseus + ChromaDB + SearXNG + ntfy)
- Native: Windows (PowerShell), Linux/macOS (bash)
- Ollama / vLLM / llama.cpp / SGLang for local model serving

## Key Directories

| Path | Purpose |
|------|---------|
| `app.py` | FastAPI entry point (orchestrator) |
| `core/` | Database models, auth, middleware, constants |
| `src/` | Core logic: LLM routing, agent loop, memory, RAG, tools |
| `routes/` | 45 FastAPI routers (chat, model, email, calendar, etc.) |
| `services/` | External integrations (search, memory, TTS, STT, YouTube) |
| `static/` | SPA frontend (`index.html`, `app.js`, `style.css`, `js/`) |
| `tests/` | Pytest test suite |
| `data/` | Runtime data (gitignored) — DB, uploads, settings |

## Commands

- **Serve**: `uvicorn app:app --host 127.0.0.1 --port 7000`
- **Setup**: `python setup.py` (first-run DB init, admin user)
- **Docker**: `docker compose up -d --build`
- **Tests**: `python -m pytest`
- **Lint**: `python -m py_compile app.py routes/*.py src/*.py`
- **CSS lint**: `npm run lint:css` (stylelint on `static/css/*.css`, ignores `.min.css`)
- **CSS fix**: `npm run lint:css:fix` (auto-fix)
- **CSS cross-file**: `npm run lint:css:cross-file` (detects duplicate selectors across CSS partials via `scripts/dedup-css.mjs`)
- **CSS verify**: `npm run verify:css` (lint + cross-file check)
- **Type check**: `venv/Scripts/mypy src/llm_core.py` (or `mypy` for broader coverage)

## Related Projects

- **Open Design** (`~/.hermes/open-design/`) — open-source Claude Design alternative. 137 composable Skills, 150 brand-grade Design Systems, 16 coding-agent CLIs detected on PATH (including Hermes). Complements Odysseus by providing AI-driven UI/UX design generation (prototypes, decks, mobile apps, dashboards, etc.). See `.hermes/open-design/README.md` for full details.

  Launch commands (PowerShell):
  ```powershell
  $HOME\.hermes\open-design\launch-open-design.ps1   # start daemon + web + open browser
  cd $HOME\.hermes\open-design; pnpm tools-dev status  # show web URL + sidecar statuses
  cd $HOME\.hermes\open-design; pnpm tools-dev stop    # stop daemon + web
  ```
  Web URL is auto-selected (ephemeral port) — check status for the current value.

## Conventions

- **Python**: FastAPI route setup uses `setup_*_routes(components...) → APIRouter` pattern in `routes/`
- **DB models**: SQLAlchemy declarative models in `core/database.py` with `TimestampMixin`
- **Migrations**: Inline SQLite `ALTER TABLE` / `PRAGMA` migrations in `core/database.py`
- **Auth**: Cookie-based sessions (admin), Bearer token API (`ody_` prefix), Localhost bypass for dev
- **Frontend**: Vanilla ES modules, no transpilation, CSS custom properties for theming
- **Window/popup patterns**: Modal divs shown/hidden via CSS classes; dedicated JS files per feature
- **Error handling**: Custom exception classes (`SessionNotFoundError`, `LLMServiceError`, etc.) with FastAPI exception handlers
- **Ponytail**: `# ponytail:` comments mark intentional shortcuts with ceiling + upgrade path (see AGENTS.md)
- **GitHub ops**: First-time push or bad-push recovery? See [`docs/push-recipe.md`](docs/push-recipe.md) for the staged-commit hygiene checklist -- leak cleanup with `git rm --cached`, cwd-leak sanity checks, and `--diff-filter=A` leak detection.
- **Holdback list**: 10-item regex in the recipe catches `.env`, `.ofp-store.json`, `coverage.json`, and other local-only files before they reach GitHub.
