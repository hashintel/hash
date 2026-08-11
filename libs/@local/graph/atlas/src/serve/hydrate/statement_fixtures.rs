//! The rendered SQL of every hydration statement, pinned byte-for-byte.
//!
//! A statement's rendering is deterministic, so each constant here is the exact text the store
//! receives. The pin makes any rendering change - a statement edit here, or a change in the
//! statement AST's own spelling upstream - a visible fixture diff in review instead of a silent
//! swap of what runs against the store.

/// The locate node hydration, detail answered for the source row alone.
pub(super) const LOCATE_DETAIL: &str = r#"SELECT "ids"."index", ("cache"."versioned_urls")[1:"cache"."direct_types"], "props"."simple", "props"."total", "label_property"."path"
FROM UNNEST(($1::uuid[]), ($2::uuid[])) WITH ORDINALITY AS "ids"("web_id", "entity_uuid", "index")
INNER JOIN "entity_temporal_metadata" AS "meta"
  ON "meta"."web_id" = "ids"."web_id"
 AND "meta"."entity_uuid" = "ids"."entity_uuid"
 AND "meta"."draft_id" IS NULL
 AND "meta"."transaction_time" @> now()::TIMESTAMPTZ
 AND "meta"."decision_time" @> now()::TIMESTAMPTZ
INNER JOIN "entity_editions" AS "edition"
  ON "edition"."entity_edition_id" = "meta"."entity_edition_id"
 AND NOT("edition"."archived")
LEFT OUTER JOIN "entity_edition_cache" AS "cache"
  ON "cache"."entity_edition_id" = "meta"."entity_edition_id"
LEFT OUTER JOIN LATERAL (SELECT jsonb_object_agg("prop"."key", "prop"."value") FILTER (WHERE jsonb_typeof("prop"."value") = ANY(($4::text[]))), (count(*)::int4)
FROM jsonb_each("edition"."properties" - ($3::text[])) AS "prop"("key", "value")) AS "props"("simple", "total")
  ON "ids"."index" = 1
LEFT OUTER JOIN LATERAL (SELECT "label_path"."path"
FROM UNNEST(("cache"."versioned_urls")[1:"cache"."direct_types"]) WITH ORDINALITY AS "direct"("url", "position")
INNER JOIN "ontology_ids"
  ON ("ontology_ids"."base_url" || ($5::text) || "ontology_ids"."version") = "direct"."url"
INNER JOIN "entity_types"
  ON "entity_types"."ontology_id" = "ontology_ids"."ontology_id"
CROSS JOIN LATERAL jsonb_array_elements_text(jsonb_path_query_array("entity_types"."closed_schema", ($6::jsonpath))) WITH ORDINALITY AS "label_path"("path", "ordinality")
WHERE jsonb_extract_path("edition"."properties", "label_path"."path") IS NOT NULL
ORDER BY "direct"."position" ASC, "label_path"."ordinality" ASC
LIMIT 1) AS "label_property"("path")
  ON "ids"."index" = 1"#;

/// The locate link hydration, detail answered for every delivered row.
pub(super) const LOCATE_LINK: &str = r#"SELECT "ids"."index", ("cache"."versioned_urls")[1:"cache"."direct_types"], "props"."simple", "props"."total", "label_property"."path"
FROM UNNEST(($1::uuid[]), ($2::uuid[])) WITH ORDINALITY AS "ids"("web_id", "entity_uuid", "index")
INNER JOIN "entity_temporal_metadata" AS "meta"
  ON "meta"."web_id" = "ids"."web_id"
 AND "meta"."entity_uuid" = "ids"."entity_uuid"
 AND "meta"."draft_id" IS NULL
 AND "meta"."transaction_time" @> now()::TIMESTAMPTZ
 AND "meta"."decision_time" @> now()::TIMESTAMPTZ
INNER JOIN "entity_editions" AS "edition"
  ON "edition"."entity_edition_id" = "meta"."entity_edition_id"
 AND NOT("edition"."archived")
LEFT OUTER JOIN "entity_edition_cache" AS "cache"
  ON "cache"."entity_edition_id" = "meta"."entity_edition_id"
LEFT OUTER JOIN LATERAL (SELECT jsonb_object_agg("prop"."key", "prop"."value") FILTER (WHERE jsonb_typeof("prop"."value") = ANY(($4::text[]))), (count(*)::int4)
FROM jsonb_each("edition"."properties" - ($3::text[])) AS "prop"("key", "value")) AS "props"("simple", "total")
  ON TRUE
LEFT OUTER JOIN LATERAL (SELECT "label_path"."path"
FROM UNNEST(("cache"."versioned_urls")[1:"cache"."direct_types"]) WITH ORDINALITY AS "direct"("url", "position")
INNER JOIN "ontology_ids"
  ON ("ontology_ids"."base_url" || ($5::text) || "ontology_ids"."version") = "direct"."url"
INNER JOIN "entity_types"
  ON "entity_types"."ontology_id" = "ontology_ids"."ontology_id"
CROSS JOIN LATERAL jsonb_array_elements_text(jsonb_path_query_array("entity_types"."closed_schema", ($6::jsonpath))) WITH ORDINALITY AS "label_path"("path", "ordinality")
WHERE jsonb_extract_path("edition"."properties", "label_path"."path") IS NOT NULL
ORDER BY "direct"."position" ASC, "label_path"."ordinality" ASC
LIMIT 1) AS "label_property"("path")
  ON TRUE"#;

/// The edges link hydration, the first direct-type URL per delivered row.
pub(super) const EDGES_LINK: &str = r#"SELECT "ids"."index", ("cache"."versioned_urls")[1]
FROM UNNEST(($1::uuid[]), ($2::uuid[])) WITH ORDINALITY AS "ids"("web_id", "entity_uuid", "index")
INNER JOIN "entity_temporal_metadata" AS "meta"
  ON "meta"."web_id" = "ids"."web_id"
 AND "meta"."entity_uuid" = "ids"."entity_uuid"
 AND "meta"."draft_id" IS NULL
 AND "meta"."transaction_time" @> now()::TIMESTAMPTZ
 AND "meta"."decision_time" @> now()::TIMESTAMPTZ
INNER JOIN "entity_editions" AS "edition"
  ON "edition"."entity_edition_id" = "meta"."entity_edition_id"
 AND NOT("edition"."archived")
LEFT OUTER JOIN "entity_edition_cache" AS "cache"
  ON "cache"."entity_edition_id" = "meta"."entity_edition_id""#;
