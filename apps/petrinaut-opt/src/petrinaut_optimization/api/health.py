"""Dependency-free service liveness probe."""

from fastapi import APIRouter, Response

health_router = APIRouter()


@health_router.get("")
async def health() -> Response:
    """Report liveness, without checking any dependency.

    A probe that reaches through to a dependency takes every task out of
    rotation as soon as that dependency is slow.
    """
    return Response(
        content='{"status":"pass"}',
        media_type="application/health+json",
    )
