"""Executes a Python Temporal.io worker with a health check HTTP server."""
import asyncio
import os

from aiohttp import web
from dotenv import find_dotenv, load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

from app.activities import complete
from app.workflows import DemoWorkflowPy

load_dotenv()
load_dotenv(dotenv_path=find_dotenv(filename=".env.local"))


async def run_worker(stop_event: asyncio.Event) -> None:
    """Connects Temporal cluster and starts worker."""
    temporal_host = os.environ.get("HASH_TEMPORAL_HOST") or "localhost"
    temporal_port = os.environ.get("HASH_TEMPORAL_PORT") or "7233"
    temporal_target = f"{temporal_host}:{temporal_port}"

    client = await Client.connect(temporal_target, namespace="default")

    worker = Worker(
        client,
        task_queue="aipy",
        # Register workflows
        workflows=[
            DemoWorkflowPy,
        ],
        # Register activities
        activities=[
            complete,
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
    site = web.TCPSite(runner, "::", port)
    print(f"HTTP server listening on port {port}")  # noqa: T201

    stop_worker = asyncio.Event()
    await asyncio.gather(run_worker(stop_worker), site.start())
    stop_worker.set()


if __name__ == "__main__":
    asyncio.run(main())
