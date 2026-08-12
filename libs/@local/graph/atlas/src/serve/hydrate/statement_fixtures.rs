//! The rendered SQL of every hydration statement, pinned byte-for-byte.
//!
//! A statement's rendering is deterministic, so each constant here is the exact text the store
//! receives. The pin makes any rendering change - a selection edit here, or a change in the
//! compiler upstream - a visible fixture diff in review instead of a
//! silent swap of what runs against the store.
//!
//! A compiler fixture pins the one-identity request under the deployment's default protection
//! with no resolved actor, which is the shape the masking assertions read. The identity
//! conjunction grows per requested id and the CASE conditions per protected property, and
//! neither growth changes the grammar pinned here.

/// The type-URL read over one requested identity.
pub(super) const TYPES: &str = r#"SELECT "entity_temporal_metadata_0_0_0"."web_id", "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_edition_cache_1_1_0"."versioned_urls", "entity_edition_cache_1_1_0"."direct_types"
FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
  ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
INNER JOIN "entity_edition_cache" AS "entity_edition_cache_1_1_0"
  ON "entity_edition_cache_1_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ AND "entity_temporal_metadata_0_0_0"."decision_time" && $2 AND ((("entity_temporal_metadata_0_0_0"."web_id" = $3) AND ("entity_temporal_metadata_0_0_0"."entity_uuid" = $4))) AND ("entity_editions_0_1_0"."archived" = $5)"#;

/// The masked detail read over one requested identity, under the deployment's default
/// protection with no resolved actor.
pub(super) const DETAIL: &str = r#"SELECT "entity_temporal_metadata_0_0_0"."web_id", "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_edition_cache_1_1_0"."versioned_urls", "entity_edition_cache_1_1_0"."direct_types", (SELECT jsonb_object_agg("scalar_property"."key", "scalar_property"."value")
FROM jsonb_each(("entity_editions_1_1_0"."properties" - (CASE WHEN ("entity_temporal_metadata_0_0_0"."entity_uuid" != $7) AND ("entity_edition_cache_1_1_0"."base_urls" @> ARRAY[$8]::text[]) THEN ARRAY[$9]::text[] ELSE ARRAY[]::text[] END))) AS "scalar_property"("key", "value")
WHERE jsonb_typeof("scalar_property"."value") = ANY(($6::text[]))), ((SELECT count(*)
FROM jsonb_each(("entity_editions_1_1_0"."properties" - (CASE WHEN ("entity_temporal_metadata_0_0_0"."entity_uuid" != $7) AND ("entity_edition_cache_1_1_0"."base_urls" @> ARRAY[$8]::text[]) THEN ARRAY[$9]::text[] ELSE ARRAY[]::text[] END))) AS "scalar_property"("key", "value"))::int4), ("entity_edition_cache_1_1_0"."label_properties")[1]
FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
  ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
INNER JOIN "entity_edition_cache" AS "entity_edition_cache_1_1_0"
  ON "entity_edition_cache_1_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
INNER JOIN "entity_editions" AS "entity_editions_1_1_0"
  ON "entity_editions_1_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ AND "entity_temporal_metadata_0_0_0"."decision_time" && $2 AND ((("entity_temporal_metadata_0_0_0"."web_id" = $3) AND ("entity_temporal_metadata_0_0_0"."entity_uuid" = $4))) AND ("entity_editions_0_1_0"."archived" = $5)"#;
