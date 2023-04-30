"""Contains the route to check the health of the service."""

from fastapi import APIRouter, Response

router = APIRouter()


@router.get("")
async def health() -> Response:
    """Route to check the health of the service."""
    return Response(status_code=200)
