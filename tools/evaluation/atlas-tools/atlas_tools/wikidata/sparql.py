"""SPARQL query builders and result parsing.

Queries are deterministic strings (stable whitespace) so they cache well:
the disk cache key includes the full query text via the request params.

Two query families:

- property inventory: all properties with datatype ``wikibase-item`` plus an
  optional usage-count proxy. The query restricts by datatype already, but
  the parser defensively re-filters (see ``parse_inventory_results``) so
  external-identifier rows (P212-style) can never leak through.
- example pairs: subject/object label pairs for one property with
  LIMIT/OFFSET for the diversity ladder, plus the subject's P31 class so the
  card builder can sample across distinct subject types.

The example query is written for STREAMING evaluation: no ORDER BY (which
would force the endpoint to materialize every statement of the property
before applying LIMIT — a guaranteed timeout for high-usage properties)
and plain ``rdfs:label`` + LANG filters instead of the WDQS-only
``SERVICE wikibase:label`` (QLever does not support the label service).
Row-order determinism is provided by the response cache keyed on
(query, endpoint, snapshot date), not by the query itself — live endpoints
never promise stable order across cold fetches.

Deep offsets via a SUBQUERY: the inner ``SELECT ?subject ?object … LIMIT
… OFFSET …`` slices the raw statement stream FIRST; the P31 and label
joins run only on the sliced rows. Endpoints stream statements in roughly
QID order = prominence order, so shallow offsets only ever see prominent
subjects (countries, heads of state); the geometric offset ladder in
``ExtractionConfig.example_offsets`` reaches the long tail (small-town
mayors live tens of thousands of statements deep). Verified live: QLever
answers the subquery form at offset 10 000 in ~0.2 s (and empty deep
slices, e.g. offset 100 000 on a small property, return an empty result
cheaply); WDQS/Blazegraph times out (>40 s) on the same query — hence the
QLever-first endpoint ladder in config.py.

:data:`EXAMPLE_QUERY_VERSION` participates in the extraction checkpoint
guard hash: bumping it on any semantic query change discards recorded
ladder outcomes so reruns re-probe endpoints instead of replaying results
of the old query.

Responses are validated into typed models (:class:`SparqlResponse`) at the
parse boundary; parsers return typed rows (:class:`InventoryRow`,
:class:`ExampleRow`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from atlas_tools.wikidata.model import Pid

WIKIBASE_ITEM_DATATYPE = "http://wikiba.se/ontology#WikibaseItem"

# Bump on any semantic change to example_pairs_query (see module docstring).
EXAMPLE_QUERY_VERSION = 3

# The SPARQL endpoints the example ladder can draw from. Ladder ORDER is
# config (``ExtractionConfig.example_endpoint_ladder``), not a constant.
type SparqlEndpoint = Literal["wdqs", "qlever"]


def property_inventory_query() -> str:
    """All wikibase-item properties, plus the ``wikibase:statements`` count.

    Honesty note: ``wikibase:statements`` is the number of statements ON THE
    PROPERTY'S OWN PAGE (P6 → 34), NOT how often the property is used in
    claims. It is kept in the inventory as a weak prominence signal and is
    not used for sampling. A real whole-graph usage GROUP BY times out on
    both public endpoints (verified live: QLever 599), so no usage-scaled
    behaviour is attempted anywhere.
    """
    return (
        "SELECT ?property ?propertyType ?usage WHERE {\n"
        "  ?property a wikibase:Property ;\n"
        "            wikibase:propertyType ?propertyType .\n"
        "  FILTER(?propertyType = wikibase:WikibaseItem)\n"
        "  OPTIONAL { ?property wikibase:statements ?usage . }\n"
        "}\n"
        "ORDER BY ?property"
    )


def property_ancestors_query() -> str:
    """P1647 (subproperty-of) CLOSURE for every item-valued property, in one
    query. Verified live on QLever: 200 in 0.3 s, 833 pairs total — small
    enough that this one DOES go through the response cache. The atlas spec
    (§3.3.3 item 3) requires closed ancestors, not just direct parents."""
    return (
        "PREFIX wdt: <http://www.wikidata.org/prop/direct/>\n"
        "PREFIX wikibase: <http://wikiba.se/ontology#>\n"
        "SELECT ?property ?ancestor WHERE {\n"
        "  ?property wikibase:propertyType wikibase:WikibaseItem .\n"
        "  ?property wdt:P1647+ ?ancestor .\n"
        "}"
    )


def example_pairs_query(
    pid: str, *, limit: int, offset: int, language: str = "en"
) -> str:
    """Subject/object label pairs for ``pid`` with subject P31 class.

    The inner subquery slices the raw statement stream (LIMIT/OFFSET on
    ``?subject wdt:PID ?object`` alone); P31 and label joins apply only to
    the sliced rows, which is what makes deep offsets answerable in
    sub-second time on QLever (see module docstring). The outer pattern can
    multiply rows (one per P31 type / label) — deliberate: the diversity
    sampler wants to see every subject type.

    Streaming-safe and portable: no ORDER BY anywhere, no WDQS-only label
    service, explicit prefixes for QLever.
    """
    return (
        "PREFIX wdt: <http://www.wikidata.org/prop/direct/>\n"
        "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n"
        "SELECT ?subjectLabel ?objectLabel ?subjectType WHERE {\n"
        "  {\n"
        "    SELECT ?subject ?object WHERE {\n"
        f"      ?subject wdt:{pid} ?object .\n"
        "    }\n"
        f"    LIMIT {limit} OFFSET {offset}\n"
        "  }\n"
        "  OPTIONAL { ?subject wdt:P31 ?subjectType . }\n"
        "  ?subject rdfs:label ?subjectLabel .\n"
        f'  FILTER(LANG(?subjectLabel) = "{language}")\n'
        "  ?object rdfs:label ?objectLabel .\n"
        f'  FILTER(LANG(?objectLabel) = "{language}")\n'
        "}"
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
    # ``wikibase:statements``: statements on the property's OWN page, not a
    # usage count (see ``property_inventory_query``). Weak prominence
    # signal; recorded in the inventory, never used for sampling.
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


def parse_ancestor_results(body: bytes) -> list[tuple[Pid, Pid]]:
    """(property, ancestor) pairs from the P1647 closure query, in response
    order."""
    response = SparqlResponse.model_validate_json(body)
    return [
        (
            Pid(_entity_id_from_uri(binding["property"].value)),
            Pid(_entity_id_from_uri(binding["ancestor"].value)),
        )
        for binding in response.results.bindings
    ]


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
