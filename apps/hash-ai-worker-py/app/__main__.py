import asyncio
import os
from temporalio.worker import Worker
from temporalio.client import Client
from aiohttp import web

from app.workflows import DemoWorkflow
from app.activities import complete

from dotenv import find_dotenv, load_dotenv


load_dotenv()
load_dotenv(dotenv_path=find_dotenv(filename=".env.local"), override=True)


async def run_worker(stop_event: asyncio.Event):
    temporal_host = os.environ.get("HASH_TEMPORAL_HOST") or "localhost"
    temporal_port = os.environ.get("HASH_TEMPORAL_PORT") or "7233"
    temporal_target = f"{temporal_host}:{temporal_port}"

    client = await Client.connect(temporal_target, namespace="default")

    worker = Worker(
        client,
        task_queue="aipy",
        # Register workflows
        workflows=[
            DemoWorkflow,
        ],
        # Register activities
        activities=[
            complete,
        ],
    )

    async with worker:
        await stop_event.wait()


async def main():
    routes = web.RouteTableDef()

    @routes.get("/health")
    async def health(_request):
        data = {"msg": "worker healthy"}
        return web.json_response(data)

    app = web.Application()
    app.add_routes(routes)
    runner = web.AppRunner(app)
    await runner.setup()
    port = 4200
    site = web.TCPSite(runner, "::", port)
    print(f"HTTP server listening on port {port}")

    stop_worker = asyncio.Event()
    await asyncio.gather(run_worker(stop_worker), site.start())
    stop_worker.set()


if __name__ == "__main__":
    asyncio.run(main())
