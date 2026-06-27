"""OpenFieldPro project status route for Odysseus."""
import subprocess
from pathlib import Path
from fastapi import APIRouter


PROJECT_PATH = Path.home() / "Downloads" / "openfieldpro_phase1" / "openfieldpro"


def _podman_status() -> dict:
    """Check if podman compose services are running."""
    try:
        result = subprocess.run(
            ["podman", "ps", "--format", "{{.Names}}\t{{.Status}}"],
            capture_output=True, text=True, timeout=5
        )
        lines = [l.strip() for l in result.stdout.strip().splitlines() if l.strip()]
        services = {}
        for line in lines:
            parts = line.split("\t", 1)
            if len(parts) == 2:
                name, status = parts
                services[name] = {"status": status, "up": status.lower().startswith("up")}
        relevant = {k: v for k, v in services.items()
                    if any(s in k.lower() for s in ["postgres", "redis", "minio", "api", "web", "caddy", "notification"])}
        return {
            "available": True,
            "services": relevant,
            "running_count": sum(1 for v in relevant.values() if v["up"]),
            "total_count": len(relevant),
        }
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {"available": False, "services": {}, "running_count": 0, "total_count": 0}


def setup_openfieldpro_routes() -> APIRouter:
    router = APIRouter(tags=["openfieldpro"])

    @router.get("/api/openfieldpro/status")
    async def openfieldpro_status() -> dict:
        podman = _podman_status()
        project_exists = PROJECT_PATH.exists()
        return {
            "project": {
                "name": "OpenFieldPro",
                "description": "Open-source HouseCall Pro alternative — free, self-hostable field service management",
                "phase": "Phase 1 — Foundation",
                "path": str(PROJECT_PATH) if project_exists else None,
                "exists": project_exists,
            },
            "stack": {
                "backend": "Fastify + TypeScript + Drizzle ORM",
                "frontend": "Next.js 15 + shadcn/ui",
                "mobile": "React Native (Expo)",
                "database": "PostgreSQL 16 + PostGIS",
                "queue": "Redis + BullMQ",
                "storage": "MinIO",
                "infra": "Podman Compose + Caddy",
            },
            "phases": [
                {"name": "Phase 1 — Foundation", "status": "built", "weeks": "1–6"},
                {"name": "Phase 2 — Scheduling & Dispatch", "status": "pending", "weeks": "7–10"},
                {"name": "Phase 3 — Invoicing & Payments", "status": "pending", "weeks": "11–14"},
                {"name": "Phase 4 — Communications", "status": "pending", "weeks": "15–18"},
                {"name": "Phase 5 — Online Booking", "status": "pending", "weeks": "19–21"},
                {"name": "Phase 6 — Reporting & Campaigns", "status": "pending", "weeks": "22–25"},
                {"name": "Phase 7 — Polish & Production", "status": "pending", "weeks": "26–30"},
            ],
            "runtime": podman,
            "seed_credentials": {
                "email": "owner@openfieldpro.local",
                "password": "OpenFieldPro123!",
            },
            "urls": {
                "dashboard": "http://localhost:3000",
                "api": "http://localhost:4000",
                "minio": "http://localhost:9001",
            },
        }

    return router
