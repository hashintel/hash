"""Routes for the Hash Agents API."""

from fastapi import APIRouter

from .agents import router as agents
from .health import router as health

router = APIRouter()

router.include_router(health, prefix="/health")
router.include_router(agents, prefix="/agents")
