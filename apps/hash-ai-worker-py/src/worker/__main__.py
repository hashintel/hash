"""Executes a Python Temporal.io worker with a health check HTTP server."""

import asyncio
import os

from aiohttp import web
from dotenv import find_dotenv, load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

from .encoding import pydantic_data_converter
from .infer.entities.activity import infer_entities
from .infer.entities.workflow import InferEntitiesWorkflow

load_dotenv()
load_dotenv(dotenv_path=find_dotenv(filename=".env.local"))


async def run_worker(stop_event: asyncio.Event) -> None:
    """Connects Temporal cluster and starts worker."""
    temporal_host = os.environ.get("HASH_TEMPORAL_HOST") or "localhost"
    temporal_port = os.environ.get("HASH_TEMPORAL_PORT") or "7233"
    temporal_target = f"{temporal_host}:{temporal_port}"

    client = await Client.connect(
        temporal_target,
        namespace="HASH",
        data_converter=pydantic_data_converter,
    )

    worker = Worker(
        client,
        task_queue="aipy",
        # Register workflows
        workflows=[InferEntitiesWorkflow],
        # Register activities
        activities=[
            infer_entities,
        ],
    )

    async with worker:
        await stop_event.wait()


async def main() -> None:
    """Starts HTTP health check server and temporal worker."""
    routes = web.RouteTableDef()

    @routes.get("/health")
    async def health(_request: web.Request) -> web.Response:
        data = {"msg": "worker healthy"}
        return web.json_response(data)

    app = web.Application()
    app.add_routes(routes)
    runner = web.AppRunner(app)
    await runner.setup()
    port = 4200
    site = web.TCPSite(runner, "127.0.0.1", port)
    print(f"HTTP server listening on port {port}")  # noqa: T201

    stop_worker = asyncio.Event()
    await asyncio.gather(run_worker(stop_worker), site.start())
    stop_worker.set()


if __name__ == "__main__":
    asyncio.run(main())
