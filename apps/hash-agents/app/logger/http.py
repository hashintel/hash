"""Contains logic for logging in the HTTP layer."""
import time
from collections.abc import Callable

import structlog
from asgi_correlation_id import correlation_id
from starlette.requests import Request
from starlette.responses import Response
from uvicorn.protocols.utils import get_path_with_query_string

logger = structlog.stdlib.get_logger("api.access")


async def logging_middleware(request: Request, call_next: Callable) -> Response:
    """Adapted from https://gist.github.com/nymous/f138c7f06062b7c43c060bf03759c29e."""
    structlog.contextvars.clear_contextvars()
    # These context vars will be added to all log entries emitted during the request
    request_id = correlation_id.get()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    start_time = time.perf_counter_ns()
    # If the call_next raises an error, we still want to return our own 500 response,
    # so we can add headers to it (process time, request ID...)
    response = Response(status_code=500)
    try:
        response = await call_next(request)
    except Exception:
        structlog.stdlib.get_logger("api.error").exception("Uncaught exception")
        raise
    finally:
        process_time = time.perf_counter_ns() - start_time

        status_code = response.status_code
        url = get_path_with_query_string(request.scope)
        client_host = request.client.host
        client_port = request.client.port
        http_method = request.method
        http_version = request.scope["http_version"]

        # Recreate the Uvicorn access log format,
        # but add all parameters as structured information
        logger.info(
            """{%s:%s} - "{%s} {%s} HTTP/{%s}" {%s}""",
            client_host,
            client_port,
            http_method,
            url,
            http_version,
            status_code,
            http={
                "url": str(request.url),
                "status_code": status_code,
                "method": http_method,
                "request_id": request_id,
                "version": http_version,
            },
            network={"client": {"ip": client_host, "port": client_port}},
            duration=process_time,
        )

        return response  # noqa: B012
