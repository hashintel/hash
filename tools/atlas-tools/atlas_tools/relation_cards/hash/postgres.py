"""Select HASH SemType link types and live examples from PostgreSQL."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, cast

import psycopg
from pydantic import AwareDatetime, PositiveInt

from atlas_tools.common.postgres import DatabaseConnectionInfo
from atlas_tools.relation_cards.hash.adapter import build_relation_records
from atlas_tools.relation_cards.hash.model import (
    EntityTypeRow,
    ExampleSecurityMode,
    HashRelationRecord,
    LinkExampleRow,
)

_EXAMPLE_SUBGROUP_POOL_FACTOR = 8
_EXAMPLE_POOL_FACTOR = 32

_ENTITY_TYPES_QUERY = """
    SELECT
        ontology_ids.base_url,
        ontology_ids.version,
        entity_types.schema,
        entity_types.closed_schema
    FROM ontology_ids
    INNER JOIN entity_types USING (ontology_id)
    INNER JOIN ontology_temporal_metadata USING (ontology_id)
    WHERE ontology_temporal_metadata.transaction_time @> %s::timestamptz
    ORDER BY ontology_ids.base_url, ontology_ids.version
"""

_EXAMPLES_QUERY = """
    WITH allowed_types AS (
        SELECT *
        FROM unnest(%s::text[], %s::bigint[])
        AS allowed_type(base_url, version)
    ),
    current_entities AS MATERIALIZED (
        SELECT
            temporal.web_id,
            temporal.entity_uuid,
            temporal.entity_edition_id
        FROM entity_temporal_metadata AS temporal
        INNER JOIN entity_editions USING (entity_edition_id)
        WHERE temporal.transaction_time @> %s::timestamptz
          AND temporal.decision_time @> %s::timestamptz
          AND temporal.draft_id IS NULL
          AND NOT entity_editions.archived
    ),
    link_entities AS MATERIALIZED (
        SELECT
            current.web_id,
            current.entity_uuid,
            direct_type.base_url AS relation_base_url,
            direct_type.version AS relation_version
        FROM current_entities AS current
        INNER JOIN entity_edition_cache AS cache USING (entity_edition_id)
        CROSS JOIN LATERAL unnest(
            cache.base_urls[1:cache.direct_types],
            cache.versions[1:cache.direct_types]
        ) AS direct_type(base_url, version)
        INNER JOIN allowed_types
          ON allowed_types.base_url = direct_type.base_url
         AND allowed_types.version = direct_type.version
        WHERE cache.base_urls && %s::text[]
    ),
    raw_examples AS (
        SELECT
            links.relation_base_url,
            links.relation_version,
            links.web_id,
            links.entity_uuid,
            left_edge.target_web_id AS subject_web_id,
            left_edge.target_entity_uuid AS subject_entity_uuid,
            right_edge.target_web_id AS object_web_id,
            right_edge.target_entity_uuid AS object_entity_uuid,
            (left_cache.labels)[1] AS subject_label,
            (right_cache.labels)[1] AS object_label,
            left_cache.base_urls[1:left_cache.direct_types]
                AS subject_direct_type_base_urls,
            left_cache.base_urls AS subject_type_base_urls,
            md5(concat_ws(
                '|',
                links.relation_base_url,
                links.relation_version,
                links.web_id,
                links.entity_uuid,
                left_edge.target_web_id,
                left_edge.target_entity_uuid,
                right_edge.target_web_id,
                right_edge.target_entity_uuid
            )) AS stable_hash
        FROM link_entities AS links
        INNER JOIN entity_edge AS left_edge
          ON left_edge.source_web_id = links.web_id
         AND left_edge.source_entity_uuid = links.entity_uuid
         AND left_edge.kind = 'has-left-entity'
         AND left_edge.direction = 'outgoing'
        INNER JOIN entity_edge AS right_edge
          ON right_edge.source_web_id = links.web_id
         AND right_edge.source_entity_uuid = links.entity_uuid
         AND right_edge.kind = 'has-right-entity'
         AND right_edge.direction = 'outgoing'
        INNER JOIN current_entities AS left_current
          ON left_current.web_id = left_edge.target_web_id
         AND left_current.entity_uuid = left_edge.target_entity_uuid
        INNER JOIN current_entities AS right_current
          ON right_current.web_id = right_edge.target_web_id
         AND right_current.entity_uuid = right_edge.target_entity_uuid
        INNER JOIN entity_edition_cache AS left_cache
          ON left_cache.entity_edition_id = left_current.entity_edition_id
        INNER JOIN entity_edition_cache AS right_cache
          ON right_cache.entity_edition_id = right_current.entity_edition_id
        WHERE nullif(btrim((left_cache.labels)[1]), '') IS NOT NULL
          AND nullif(btrim((right_cache.labels)[1]), '') IS NOT NULL
    ),
    scored_examples AS (
        SELECT
            *,
            count(*) OVER (
                PARTITION BY
                    relation_base_url,
                    relation_version,
                    subject_web_id,
                    subject_entity_uuid
            ) AS subject_frequency,
            count(*) OVER (
                PARTITION BY
                    relation_base_url,
                    relation_version,
                    object_web_id,
                    object_entity_uuid
            ) AS object_frequency,
            row_number() OVER (
                PARTITION BY
                    relation_base_url,
                    relation_version,
                    subject_web_id,
                    subject_entity_uuid,
                    object_web_id,
                    object_entity_uuid
                ORDER BY stable_hash
            ) AS pair_rank
        FROM raw_examples
    ),
    distinct_examples AS (
        SELECT
            *,
            ln(1.0 + subject_frequency) + ln(1.0 + object_frequency)
                AS recognizability
        FROM scored_examples
        WHERE pair_rank = 1
    ),
    stratified_examples AS (
        SELECT
            *,
            coalesce((subject_direct_type_base_urls)[1], '') AS subgroup,
            row_number() OVER (
                PARTITION BY
                    relation_base_url,
                    relation_version,
                    coalesce((subject_direct_type_base_urls)[1], '')
                ORDER BY stable_hash
            ) AS subgroup_rank
        FROM distinct_examples
    ),
    pooled_examples AS (
        SELECT *
        FROM stratified_examples
        WHERE subgroup_rank <= %s
    ),
    ranked_examples AS (
        SELECT
            *,
            row_number() OVER (
                PARTITION BY relation_base_url, relation_version
                ORDER BY
                    subgroup_rank,
                    md5(relation_base_url || '|' || subgroup),
                    recognizability DESC,
                    stable_hash
            ) AS relation_rank
        FROM pooled_examples
    )
    SELECT
        relation_base_url,
        relation_version,
        web_id::text,
        entity_uuid::text,
        subject_web_id::text,
        subject_entity_uuid::text,
        object_web_id::text,
        object_entity_uuid::text,
        subject_label,
        object_label,
        subject_direct_type_base_urls,
        subject_type_base_urls,
        subject_frequency,
        object_frequency
    FROM ranked_examples
    WHERE relation_rank <= %s
    ORDER BY
        relation_base_url,
        relation_version,
        relation_rank
"""


class _Result(Protocol):
    def fetchone(self) -> Sequence[object] | None: ...

    def fetchall(self) -> Sequence[Sequence[object]]: ...


class _Connection(Protocol):
    def execute(
        self,
        query: str,
        params: Sequence[object] | None = None,
    ) -> _Result: ...


@dataclass(frozen=True)
class LiveHashExtraction:
    """Records selected from one repeatable-read live database transaction."""

    snapshot_at: AwareDatetime
    entity_type_versions: int
    example_candidates: int
    records: list[HashRelationRecord]


class HashPostgresError(RuntimeError):
    """A live HASH relation-card query failed."""


def _select_snapshot_time(connection: _Connection) -> datetime:
    row = connection.execute("SELECT transaction_timestamp()").fetchone()
    if row is None:
        raise HashPostgresError("PostgreSQL returned no transaction timestamp")

    return cast("datetime", row[0])


def _select_entity_types(
    connection: _Connection,
    snapshot_at: datetime,
) -> list[EntityTypeRow]:
    rows = connection.execute(_ENTITY_TYPES_QUERY, (snapshot_at,)).fetchall()

    return [
        EntityTypeRow.model_validate(
            {
                "base_url": row[0],
                "version": row[1],
                "schema": row[2],
                "closed_schema": row[3],
            }
        )
        for row in rows
    ]


def _select_examples(
    connection: _Connection,
    snapshot_at: datetime,
    records: Sequence[HashRelationRecord],
    *,
    example_count: int,
) -> list[LinkExampleRow]:
    if not records:
        return []

    relation_base_urls = [str(record.base_url) for record in records]
    relation_versions = [record.version for record in records]
    rows = connection.execute(
        _EXAMPLES_QUERY,
        (
            relation_base_urls,
            relation_versions,
            snapshot_at,
            snapshot_at,
            relation_base_urls,
            example_count * _EXAMPLE_SUBGROUP_POOL_FACTOR,
            example_count * _EXAMPLE_POOL_FACTOR,
        ),
    ).fetchall()

    return [
        LinkExampleRow(
            relation_base_url=cast("str", row[0]),
            relation_version=cast("int", row[1]),
            link_entity_id=f"{row[2]}/{row[3]}",
            subject_id=f"{row[4]}/{row[5]}",
            object_id=f"{row[6]}/{row[7]}",
            subject_label=cast("str", row[8]),
            object_label=cast("str", row[9]),
            subject_direct_type_base_urls=cast("tuple[str, ...]", row[10]),
            subject_type_base_urls=cast("tuple[str, ...]", row[11]),
            subject_frequency=cast("int", row[12]),
            object_frequency=cast("int", row[13]),
        )
        for row in rows
    ]


def _extract_from_connection(
    connection: _Connection,
    *,
    example_count: PositiveInt,
    example_security_mode: ExampleSecurityMode,
) -> LiveHashExtraction:
    """Select and adapt records using an already-open live transaction."""
    snapshot_at = _select_snapshot_time(connection)
    entity_types = _select_entity_types(connection, snapshot_at)
    records_without_examples = build_relation_records(
        entity_types,
        [],
        example_count=example_count,
    )
    examples = (
        _select_examples(
            connection,
            snapshot_at,
            records_without_examples,
            example_count=example_count,
        )
        if example_security_mode == "all-snapshot-links"
        else []
    )
    records = build_relation_records(
        entity_types,
        examples,
        example_count=example_count,
    )
    return LiveHashExtraction(
        snapshot_at=snapshot_at,
        entity_type_versions=len(entity_types),
        example_candidates=len(examples),
        records=records,
    )


def extract_live_hash_relations(
    connection_info: DatabaseConnectionInfo,
    *,
    example_count: PositiveInt,
    example_security_mode: ExampleSecurityMode,
) -> LiveHashExtraction:
    """Read relation records directly from the live HASH database."""
    try:
        with psycopg.connect(
            host=connection_info.host,
            port=connection_info.port,
            user=connection_info.user,
            password=connection_info.password,
            dbname=connection_info.database,
        ) as connection:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            return _extract_from_connection(
                cast("_Connection", connection),
                example_count=example_count,
                example_security_mode=example_security_mode,
            )
    except psycopg.Error as error:
        raise HashPostgresError(f"HASH PostgreSQL selection failed: {error}") from error
