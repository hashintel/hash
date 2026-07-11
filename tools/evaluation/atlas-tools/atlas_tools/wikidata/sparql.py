"""SPARQL query builders and result parsing.

Queries are deterministic strings (stable whitespace, ORDER BY for stable
row order) so they cache well: the disk cache key includes the full query
text via the request params.

Two query families:

- property inventory: all properties with datatype ``wikibase-item`` plus an
  optional usage-count proxy. The query restricts by datatype already, but
  the parser defensively re-filters (see ``parse_inventory_results``) so
  external-identifier rows (P212-style) can never leak through.
- example pairs: subject/object label pairs for one property with
  LIMIT/OFFSET for the diversity ladder, plus the subject's P31 class so the
  card builder can sample across distinct subject types.

Responses are validated into typed models (:class:`SparqlResponse`) at the
parse boundary; parsers return typed rows (:class:`InventoryRow`,
:class:`ExampleRow`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

WIKIBASE_ITEM_DATATYPE = "http://wikiba.se/ontology#WikibaseItem"

# The SPARQL endpoints the example ladder can draw from, in ladder order.
type SparqlEndpoint = Literal["wdqs", "qlever"]

SPARQL_ENDPOINT_LADDER: tuple[SparqlEndpoint, ...] = ("wdqs", "qlever")


def property_inventory_query() -> str:
    """All wikibase-item properties, with a usage-count proxy for sampling."""
    return (
        "SELECT ?property ?propertyType ?usage WHERE {\n"
        "  ?property a wikibase:Property ;\n"
        "            wikibase:propertyType ?propertyType .\n"
        "  FILTER(?propertyType = wikibase:WikibaseItem)\n"
        "  OPTIONAL { ?property wikibase:statements ?usage . }\n"
        "}\n"
        "ORDER BY ?property"
    )


def example_pairs_query(pid: str, *, limit: int, offset: int) -> str:
    """Subject/object label pairs for ``pid`` with subject P31 class.

    LIMIT/OFFSET implements the diversity ladder: configured offsets slice
    different regions of the result set; final diversity comes from the
    deterministic across-subject-type sampling in ``properties.py``.
    """
    return (
        "SELECT ?subjectLabel ?objectLabel ?subjectType WHERE {\n"
        f"  ?subject wdt:{pid} ?object .\n"
        "  OPTIONAL { ?subject wdt:P31 ?subjectType . }\n"
        "  SERVICE wikibase:label "
        '{ bd:serviceParam wikibase:language "en". }\n'
        "}\n"
        "ORDER BY ?subject ?object\n"
        f"LIMIT {limit} OFFSET {offset}"
    )


def sparql_params(query: str) -> dict[str, str]:
    """GET params for a SPARQL endpoint (WDQS and QLever both accept these)."""
    return {"query": query, "format": "json"}


class SparqlValue(BaseModel):
    """One bound value in a SPARQL JSON results binding."""

    value: str


class SparqlResults(BaseModel):
    bindings: list[dict[str, SparqlValue]] = Field(default_factory=list)


class SparqlResponse(BaseModel):
    """The subset of the SPARQL 1.1 JSON results format this tool reads."""

    results: SparqlResults


def _entity_id_from_uri(uri: str) -> str:
    """'http://www.wikidata.org/entity/P361' -> 'P361' (also handles bare ids)."""
    return uri.rsplit("/", 1)[-1]


class InventoryRow(BaseModel):
    model_config = ConfigDict(frozen=True)

    pid: str
    datatype_uri: str
    usage: int | None


def parse_inventory_results(body: bytes) -> list[InventoryRow]:
    """Parse the SPARQL JSON results of the inventory query.

    Rows are returned in response order (the query ORDERs BY property).
    """
    response = SparqlResponse.model_validate_json(body)
    rows: list[InventoryRow] = []

    for binding in response.results.bindings:
        usage_binding = binding.get("usage")
        rows.append(
            InventoryRow(
                pid=_entity_id_from_uri(binding["property"].value),
                datatype_uri=binding["propertyType"].value,
                usage=int(usage_binding.value) if usage_binding else None,
            )
        )

    return rows


class ExampleRow(BaseModel):
    model_config = ConfigDict(frozen=True)

    subject_label: str
    object_label: str
    subject_type: str  # QID, or "" when the subject has no P31


def parse_example_results(body: bytes) -> list[ExampleRow]:
    response = SparqlResponse.model_validate_json(body)
    rows: list[ExampleRow] = []

    for binding in response.results.bindings:
        subject_type_binding = binding.get("subjectType")
        rows.append(
            ExampleRow(
                subject_label=binding["subjectLabel"].value,
                object_label=binding["objectLabel"].value,
                subject_type=(
                    _entity_id_from_uri(subject_type_binding.value)
                    if subject_type_binding
                    else ""
                ),
            )
        )

    return rows
