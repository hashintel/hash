"""Live HASH PostgreSQL row-boundary tests with an in-memory connection."""

from collections.abc import Sequence
from datetime import UTC, datetime

from atlas_tools.relation_cards.hash.postgres import (
    _ENTITY_TYPES_QUERY,
    _EXAMPLES_QUERY,
    _extract_from_connection,
)
from tests.relation_cards.hash.test_adapter import _fixture_types


class _Result:
    def __init__(self, rows: list[tuple[object, ...]]) -> None:
        self.rows = rows

    def fetchone(self) -> tuple[object, ...] | None:
        return self.rows[0] if self.rows else None

    def fetchall(self) -> list[tuple[object, ...]]:
        return self.rows


class _Connection:
    def __init__(self) -> None:
        self.snapshot = datetime(2026, 7, 12, 12, tzinfo=UTC)
        self.queries: list[tuple[str, object]] = []

    def execute(
        self,
        query: str,
        params: Sequence[object] | None = None,
    ) -> _Result:
        self.queries.append((query, params))
        if "transaction_timestamp" in query:
            return _Result([(self.snapshot,)])
        if "FROM ontology_ids" in query:
            return _Result(
                [
                    (
                        str(row.base_url),
                        row.version,
                        row.source_schema.model_dump(mode="json", by_alias=True),
                        row.closed_schema.model_dump(mode="json", by_alias=True),
                    )
                    for row in _fixture_types()
                ]
            )
        return _Result(
            [
                (
                    "https://example.com/@acme/types/entity-type/owns/",
                    2,
                    "web-a",
                    "link-a",
                    "web-a",
                    "alice",
                    "web-a",
                    "car",
                    "Alice",
                    "Car",
                    ["https://example.com/@acme/types/entity-type/person/"],
                    ["https://example.com/@acme/types/entity-type/person/"],
                    4,
                    3,
                )
            ]
        )


def test_live_extraction_uses_one_timestamp_for_types_and_examples() -> None:
    connection = _Connection()

    extraction = _extract_from_connection(
        connection,
        example_count=3,
        example_security_mode="all-snapshot-links",
    )

    assert extraction.snapshot_at == connection.snapshot
    assert extraction.entity_type_versions == len(_fixture_types())
    assert extraction.entity_types == tuple(_fixture_types())
    assert extraction.example_candidates == 1
    relation = next(record for record in extraction.records if record.card_input.title == "Owns")
    assert relation.card_input.examples[0].subject_label == "Alice"
    assert relation.card_input.examples[0].object_label == "Car"

    ontology_params = next(
        params for query, params in connection.queries if query == _ENTITY_TYPES_QUERY
    )
    example_params = next(
        params for query, params in connection.queries if query == _EXAMPLES_QUERY
    )
    assert ontology_params == (connection.snapshot,)
    assert isinstance(example_params, tuple)
    assert example_params[0] == [
        "https://blockprotocol.org/@blockprotocol/types/entity-type/link/",
        "https://example.com/@acme/types/entity-type/owns/",
    ]
    assert example_params[1] == [1, 2]
    assert example_params[2:4] == (connection.snapshot, connection.snapshot)
    assert example_params[5:] == (24, 96)


def test_historical_extraction_uses_the_requested_snapshot_without_reading_now() -> None:
    connection = _Connection()
    requested = datetime(2026, 7, 11, 8, 30, tzinfo=UTC)

    extraction = _extract_from_connection(
        connection,
        example_count=3,
        example_security_mode="none",
        snapshot_at=requested,
    )

    assert extraction.snapshot_at == requested
    assert all("transaction_timestamp" not in query for query, _params in connection.queries)
    ontology_params = next(
        params for query, params in connection.queries if query == _ENTITY_TYPES_QUERY
    )
    assert ontology_params == (requested,)


def test_example_query_excludes_drafts_and_preserves_endpoint_roles() -> None:
    assert "temporal.draft_id IS NULL" in _EXAMPLES_QUERY
    assert "NOT entity_editions.archived" in _EXAMPLES_QUERY
    assert "left_edge.kind = 'has-left-entity'" in _EXAMPLES_QUERY
    assert "right_edge.kind = 'has-right-entity'" in _EXAMPLES_QUERY
    assert "cache.base_urls[1:cache.direct_types]" in _EXAMPLES_QUERY
    assert "cache.versions[1:cache.direct_types]" in _EXAMPLES_QUERY
    assert "left_cache.base_urls[1:left_cache.direct_types]" in _EXAMPLES_QUERY
    assert "nullif(btrim((left_cache.labels)[1]), '') IS NOT NULL" in _EXAMPLES_QUERY
    assert "nullif(btrim((right_cache.labels)[1]), '') IS NOT NULL" in _EXAMPLES_QUERY
    assert "WHERE pair_rank = 1" in _EXAMPLES_QUERY
    assert "WHERE subgroup_rank <= %s" in _EXAMPLES_QUERY
    assert "subject_frequency" in _EXAMPLES_QUERY
    assert "object_frequency" in _EXAMPLES_QUERY
    assert "stable_hash" in _EXAMPLES_QUERY
    assert "ORDER BY stable_hash\n            ) AS subgroup_rank" in _EXAMPLES_QUERY
    assert "WHERE relation_rank <= %s" in _EXAMPLES_QUERY


def test_native_examples_fail_closed_without_security_mode() -> None:
    connection = _Connection()

    extraction = _extract_from_connection(
        connection,
        example_count=3,
        example_security_mode="none",
    )

    assert extraction.example_candidates == 0
    assert all(query != _EXAMPLES_QUERY for query, _params in connection.queries)
