"""Bound optimization manifests before the request body is decoded."""

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_REQUEST_BODY_MIB = 8
MAX_REQUEST_BODY_BYTES = MAX_REQUEST_BODY_MIB * 1024 * 1024


class _RequestBodyTooLargeError(HTTPException):
    def __init__(self) -> None:
        # FastAPI preserves HTTP errors raised while it reads the body; other
        # exceptions become a generic 400 before this middleware can catch them.
        super().__init__(413, f"Request body exceeds the {MAX_REQUEST_BODY_MIB} MiB limit")


class RequestBodyLimitMiddleware:
    """Reject oversized optimization manifests, including chunked bodies."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "POST"
            or scope["path"] != "/optimize/runs"
        ):
            await self.app(scope, receive, send)
            return

        content_length = dict(scope.get("headers", [])).get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_REQUEST_BODY_BYTES:
                    await self._reject(scope, receive, send)
                    return
            except ValueError:
                pass

        received_bytes = 0

        async def limited_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > MAX_REQUEST_BODY_BYTES:
                    raise _RequestBodyTooLargeError
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _RequestBodyTooLargeError:
            await self._reject(scope, receive, send)

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            status_code=413,
            content={"detail": f"Request body exceeds the {MAX_REQUEST_BODY_MIB} MiB limit"},
        )
        await response(scope, receive, send)
