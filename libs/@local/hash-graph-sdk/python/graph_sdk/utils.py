"""Miscellaneous utilities for the SDK."""

import asyncio
from collections.abc import Awaitable
from typing import TYPE_CHECKING, Any, TypeVar

from graph_client.models import KnowledgeGraphVertex, OntologyVertex, Subgraph
from pydantic import BaseModel, ValidationError

if TYPE_CHECKING:
    from types import EllipsisType

try:
    # noinspection PyUnresolvedReferences
    import devtools

    IS_DEV = True
except ImportError:
    IS_DEV = False

T = TypeVar("T")

Missing = ...


def async_to_sync(awaitable: Awaitable[T]) -> T:
    """Run an awaitable and return the result.

    Different from `asyncio.run` in that it does not create a new event loop each time.
    """
    response: T | "EllipsisType" = Missing

    async def run_and_capture() -> None:
        nonlocal response
        response = await awaitable

    loop = asyncio.get_event_loop()
    coroutine = run_and_capture()
    loop.run_until_complete(coroutine)

    if response is Missing:
        msg = "response was not set"
        raise ValueError(msg)

    return response


def filter_latest_from_subgraph(
    subgraph: Subgraph,
) -> list[KnowledgeGraphVertex | OntologyVertex]:
    """Filters the latest version of each entity from a subgraph."""
    # is typed wrong, this can never be None
    vertices = subgraph.vertices.root or {}

    vertices_versions = (vertex for vertex in vertices.values() if vertex)
    sorted_versions = (
        sorted(vertex.items(), key=lambda kv: kv[0], reverse=True)
        for vertex in vertices_versions
    )

    latest_vertices = (next(iter(entity)) for entity in sorted_versions)

    return [vertex[1] for vertex in latest_vertices if vertex]


def filter_latest_ontology_types_from_subgraph(
    subgraph: Subgraph,
) -> list[OntologyVertex]:
    """Filters the latest version of each ontology type from a subgraph."""
    return [
        vertex
        for vertex in filter_latest_from_subgraph(subgraph)
        if isinstance(vertex, OntologyVertex)
    ]


def print_schema(model: type[BaseModel], data: Any) -> None:  # noqa: ANN401
    """Function to print the schema and the value of a BaseModel.

    Debugging purposes only.
    """
    if not IS_DEV:
        return

    devtools.pprint(model.model_json_schema())

    try:
        parsed_data = model.model_validate(data)
    except ValidationError as err:
        devtools.pprint(err)
    else:
        devtools.pprint(parsed_data.model_dump())
