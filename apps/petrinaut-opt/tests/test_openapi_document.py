"""Checks on the OpenAPI document the TypeScript client is generated from.

`libs/@local/petrinaut-optimizer-client` runs `openapi-typescript` over
`openapi/openapi.json` and re-exports the result, so that file is this
service's published contract rather than a build artifact. Two things can go
wrong with it, and each has a check below: the committed document can fall
behind the service, and a refactor can quietly change what the client reads —
the endpoints it may call, the media type of the optimization streams, or the
schema names it references by hand.
"""

import json

from pydantic import JsonValue

from scripts.generate_openapi import CODEGEN_COMMAND, DOCUMENT_PATH, render_document

type JsonObject = dict[str, JsonValue]
"""One JSON object of the document under inspection."""

CLIENT_SURFACE = {
    ("/", "get"),
    ("/optimize/all", "post"),
    ("/optimize/best", "post"),
    ("/status", "get"),
    ("/status/{run_id}", "get"),
}
"""Every operation the service publishes, as path and HTTP method.

Spelled out rather than derived from the application: derived from it, this
would restate how FastAPI builds a document, and adding or withdrawing an
endpoint would pass unnoticed. Written out, the client's callable surface
changes only in a diff that says so.
"""

STREAMING_PATHS = ("/optimize/all", "/optimize/best")
"""The endpoints answering with a Server-Sent Events stream."""

RUN_STATUS_SCHEMA = {"$ref": "#/components/schemas/RunStatus"}
"""The reference the client resolves as `components["schemas"]["RunStatus"]`."""


def _served_document() -> JsonObject:
    """Return the schema the running service serves, parsed."""
    document: JsonValue = json.loads(render_document())
    assert isinstance(document, dict), "the rendered schema is not a JSON object"
    return document


def _object_at(document: JsonObject, /, *keys: str) -> JsonObject:
    """Descend through nested JSON objects, naming the key that is missing."""
    value: JsonValue = document
    for key in keys:
        assert isinstance(value, dict), f"{key}: expected an object"
        assert key in value, f"the document has no {key}"
        value = value[key]

    assert isinstance(value, dict), f"expected an object at {keys[-1]}"
    return value


def _operations() -> dict[tuple[str, str], JsonObject]:
    """Index every documented operation by its path and HTTP method."""
    paths = _object_at(_served_document(), "paths")

    operations: dict[tuple[str, str], JsonObject] = {}
    for path in paths:
        methods = _object_at(paths, path)
        for method in methods:
            operations[path, method] = _object_at(methods, method)

    return operations


def test_the_committed_document_is_the_schema_the_service_serves() -> None:
    """A schema change that skips codegen leaves the client generated from stale bytes."""
    committed = DOCUMENT_PATH.read_text(encoding="utf-8")
    rendered = render_document()

    assert json.loads(committed) == json.loads(rendered), (
        f"the committed OpenAPI document is not what the service serves; run `{CODEGEN_COMMAND}`"
    )
    assert committed == rendered, (
        "the committed OpenAPI document carries the right schema in different bytes,"
        f" so every regeneration rewrites the file; run `{CODEGEN_COMMAND}`"
    )


def test_the_published_operations_are_the_client_surface() -> None:
    """An endpoint added or withdrawn changes what the generated client can call."""
    assert set(_operations()) == CLIENT_SURFACE


def test_the_optimization_streams_are_published_as_server_sent_events() -> None:
    """The SSE responses are hand-declared.

    Both stream endpoints return `StreamingResponse`, which FastAPI documents
    as `application/json` unless the route declares otherwise. A refactor that
    drops that declaration would generate a client typed as if the optimizer
    answered with one JSON body, so the media type is checked rather than the
    presence of a 200.
    """
    operations = _operations()
    for path in STREAMING_PATHS:
        success = _object_at(operations[path, "post"], "responses", "200", "content")

        assert set(success) == {"text/event-stream"}, path


def test_the_optimization_streams_document_their_rejections() -> None:
    """The optimizer's back-pressure contract.

    A client that cannot see 429 and its `Retry-After` header has no documented
    way to wait for a free study slot, and one that cannot see 413 cannot tell
    an oversized manifest from a service failure.
    """
    operations = _operations()
    for path in STREAMING_PATHS:
        responses = _object_at(operations[path, "post"], "responses")

        assert {"413", "429", "500"} <= set(responses), path
        assert "Retry-After" in _object_at(responses, "429", "headers"), path


def test_the_status_endpoints_keep_the_schema_name_the_client_references() -> None:
    """`RunStatus` is named in the client's source; renaming the model breaks it."""
    operations = _operations()

    one = _object_at(
        operations["/status/{run_id}", "get"],
        "responses",
        "200",
        "content",
        "application/json",
        "schema",
    )
    assert one == RUN_STATUS_SCHEMA

    many = _object_at(
        operations["/status", "get"],
        "responses",
        "200",
        "content",
        "application/json",
        "schema",
    )
    assert many.get("type") == "array"
    assert many.get("items") == RUN_STATUS_SCHEMA
