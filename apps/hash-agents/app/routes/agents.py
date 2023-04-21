import logging

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from app.agents import call_agent

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/{agent_name}")
async def agent(agent_name: str, request: Request) -> JSONResponse:
    # noinspection PyBroadException
    try:
        return JSONResponse(content=call_agent(agent_name, **await request.json()))
    except Exception:
        logger.exception("Could not execute agent.")
        return JSONResponse(
            content={"error": "Could not execute agent. Look in logs for cause."}
        )
