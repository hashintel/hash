//! The store boundary.
//!
//! Live detail reads over the serving store pool.
//!
//! One batched query per request, input order preserved through the ordinality column, absent
//! entities missing from the result. Each query borrows a connection for its own duration and
//! returns it, so a request's hydration waits only on the store's own work.
//!
//! Every read of an entity's properties object passes through [`MASKED_PROPERTIES`], so a protected
//! property reaches no properties column of any trailer. A label is a materialized property value
//! and stands outside that rule, as it does on the graph's own read path: see the trailer contract
//! in [the module above](super).

use alloc::sync::Arc;

use error_stack::Report;
use hash_graph_postgres_store::store::{AsClient, PostgresStorePool, error::StoreError};
use hash_graph_store::pool::StorePool as _;
use tokio_postgres::GenericClient as _;
use type_system::ontology::id::BaseUrl;
use zerocopy::IntoBytes as _;

use super::{
    columns::{
        DeliveredEntities, EdgeLinkDetails, LocateLinkDetails, LocateNodeDetails, NodeDetails,
        SimpleValue,
    },
    select::{select_properties, simple_properties},
};
use crate::dataset::ArchivedEntityId;

/// The base URL of the system `icon` property an entity may carry.
const ICON_PROPERTY: &str = "https://hash.ai/@h/types/property-type/icon/";

/// The entity's properties with every protected key removed.
///
/// Every property value a hydration query reads comes from this expression, and `$3` carries the
/// protected base URLs in every query that has one. Removing the keys at the JSONB itself covers
/// each derived column at once, so an aggregate, a count and a single-key lookup all read the
/// masked object. The parens hold the subtraction to the whole object, since `->` binds tighter
/// than `-`: without them `properties - keys -> 'f'` subtracts `keys -> 'f'`.
///
/// The store removes the same keys with the same operator under a per-actor condition, so an
/// unconditional removal withholds at least what the store withholds from any actor. The tests pin
/// every query to this exact spelling.
const MASKED_PROPERTIES: &str = "(edition.properties - $3::text[])";

/// The tile hydration query.
///
/// One batched lookup, input order preserved through the ordinality column, absent entities missing
/// from the result. `$3` carries the protected properties and `$4` the icon's base URL.
///
/// The type icon resolves set-wise rather than per row. An icon belongs to an entity's types, and a
/// deployment holds far fewer entity types than a tile holds points, so the query builds the map
/// from versioned URL to icon once and joins it. Resolving it inside a per-row lateral instead
/// costs sequential `ontology_ids` scans, one for every delivered point. The join key there is
/// `base_url || 'v/' || version`, an expression no index answers, so the planner rebuilds the same
/// small map once per point. That shape dominated tile hydration until this one replaced it.
///
/// `DISTINCT ON` keeps the lateral's selection rule. Among the icon-bearing entries of an entity's
/// direct types, the shallowest wins and the type's position breaks the tie, and an entity whose
/// types carry no icon keeps its row with a null.
const DETAIL_QUERY: &str = "
    WITH type_icons AS MATERIALIZED (
        SELECT
            ontology_ids.base_url || 'v/' || ontology_ids.version AS url,
            display.value ->> 'icon' AS icon,
            (display.value ->> 'depth')::int AS depth
        FROM entity_types
        JOIN ontology_ids
          ON ontology_ids.ontology_id = entity_types.ontology_id
        CROSS JOIN LATERAL jsonb_array_elements(
            entity_types.closed_schema -> 'allOf'
        ) AS display (value)
        WHERE display.value ->> 'icon' IS NOT NULL
    )
    SELECT DISTINCT ON (ids.index)
        ids.index,
        cache.labels[1] AS label,
        CASE
            WHEN jsonb_typeof((edition.properties - $3::text[]) -> $4::text) = 'string'
                THEN (edition.properties - $3::text[]) ->> $4::text
        END AS own_icon,
        type_icon.icon AS type_icon
    FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS ids (web_id, entity_uuid, index)
    JOIN entity_temporal_metadata AS meta
      ON meta.web_id = ids.web_id
     AND meta.entity_uuid = ids.entity_uuid
     AND meta.draft_id IS NULL
     AND meta.transaction_time @> now()
     AND meta.decision_time @> now()
    JOIN entity_editions AS edition
      ON edition.entity_edition_id = meta.entity_edition_id
     AND NOT edition.archived
    LEFT JOIN entity_edition_cache AS cache
      ON cache.entity_edition_id = meta.entity_edition_id
    LEFT JOIN LATERAL unnest(cache.versioned_urls[1:cache.direct_types])
        WITH ORDINALITY AS direct (url, position) ON TRUE
    LEFT JOIN type_icons AS type_icon
      ON type_icon.url = direct.url
    ORDER BY ids.index, type_icon.depth NULLS LAST, direct.position
";

/// The locate node hydration query.
///
/// Labels and direct-type URLs for every delivered node, plus - gated to the first input, the
/// source - the simple-valued properties, the whole-set property count, and the base URL
/// providing the display label. Input order preserved through the ordinality column, absent
/// entities missing from the result.
///
/// The `simple` column aggregates only simple-typed values - the filter runs in the store, so
/// nested values never cross the connection - while `total` counts the whole masked object, the
/// completeness flag's ground truth. Both read [`MASKED_PROPERTIES`], so a protected property is
/// absent from the map and absent from the count: completeness attests the deliverable set, and
/// `total` against the delivered map is no signal that a withheld property exists.
///
/// The `label_property` lateral mirrors the `entity_edition_cache` label derivation (migration
/// V51). The path behind `labels[1]` is the first `allOf` `labelProperty` path that resolves
/// non-null in canonical direct-type order. It reads the *unmasked* object on purpose - masking it
/// would attribute the label to the next candidate path instead of the one that produced it - and
/// it delivers no value, only the path's own name.
const LOCATE_DETAIL_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        cache.versioned_urls[1:cache.direct_types] AS type_urls,
        props.simple::text AS simple,
        props.total AS total,
        label_property.path AS label_property
    FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS ids (web_id, entity_uuid, index)
    JOIN entity_temporal_metadata AS meta
      ON meta.web_id = ids.web_id
     AND meta.entity_uuid = ids.entity_uuid
     AND meta.draft_id IS NULL
     AND meta.transaction_time @> now()
     AND meta.decision_time @> now()
    JOIN entity_editions AS edition
      ON edition.entity_edition_id = meta.entity_edition_id
     AND NOT edition.archived
    LEFT JOIN entity_edition_cache AS cache
      ON cache.entity_edition_id = meta.entity_edition_id
    LEFT JOIN LATERAL (
        SELECT
            jsonb_object_agg(prop.key, prop.value) FILTER (
                WHERE jsonb_typeof(prop.value) IN ('string', 'number', 'boolean', 'null')
            ) AS simple,
            count(*)::int4 AS total
        FROM jsonb_each((edition.properties - $3::text[])) AS prop (key, value)
    ) AS props ON ids.index = 1
    LEFT JOIN LATERAL (
        SELECT label_path.path
        FROM unnest(cache.versioned_urls[1:cache.direct_types])
            WITH ORDINALITY AS direct (url, position)
        JOIN ontology_ids
          ON ontology_ids.base_url || 'v/' || ontology_ids.version = direct.url
        JOIN entity_types
          ON entity_types.ontology_id = ontology_ids.ontology_id
        CROSS JOIN LATERAL jsonb_array_elements_text(
            jsonb_path_query_array(entity_types.closed_schema, '$.allOf[*].labelProperty')
        ) WITH ORDINALITY AS label_path (path, ordinality)
        WHERE jsonb_extract_path(edition.properties, label_path.path) IS NOT NULL
        ORDER BY direct.position, label_path.ordinality
        LIMIT 1
    ) AS label_property ON ids.index = 1
";

/// The locate link hydration query.
///
/// The locate node query's columns for every delivered link entity, ungated: every edge in a
/// locate response carries its label, direct-type URLs, capped properties, and completeness
/// flags. Properties and their count read [`MASKED_PROPERTIES`], as in the node query.
const LOCATE_LINK_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        cache.versioned_urls[1:cache.direct_types] AS type_urls,
        props.simple::text AS simple,
        props.total AS total,
        label_property.path AS label_property
    FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS ids (web_id, entity_uuid, index)
    JOIN entity_temporal_metadata AS meta
      ON meta.web_id = ids.web_id
     AND meta.entity_uuid = ids.entity_uuid
     AND meta.draft_id IS NULL
     AND meta.transaction_time @> now()
     AND meta.decision_time @> now()
    JOIN entity_editions AS edition
      ON edition.entity_edition_id = meta.entity_edition_id
     AND NOT edition.archived
    LEFT JOIN entity_edition_cache AS cache
      ON cache.entity_edition_id = meta.entity_edition_id
    LEFT JOIN LATERAL (
        SELECT
            jsonb_object_agg(prop.key, prop.value) FILTER (
                WHERE jsonb_typeof(prop.value) IN ('string', 'number', 'boolean', 'null')
            ) AS simple,
            count(*)::int4 AS total
        FROM jsonb_each((edition.properties - $3::text[])) AS prop (key, value)
    ) AS props ON TRUE
    LEFT JOIN LATERAL (
        SELECT label_path.path
        FROM unnest(cache.versioned_urls[1:cache.direct_types])
            WITH ORDINALITY AS direct (url, position)
        JOIN ontology_ids
          ON ontology_ids.base_url || 'v/' || ontology_ids.version = direct.url
        JOIN entity_types
          ON entity_types.ontology_id = ontology_ids.ontology_id
        CROSS JOIN LATERAL jsonb_array_elements_text(
            jsonb_path_query_array(entity_types.closed_schema, '$.allOf[*].labelProperty')
        ) WITH ORDINALITY AS label_path (path, ordinality)
        WHERE jsonb_extract_path(edition.properties, label_path.path) IS NOT NULL
        ORDER BY direct.position, label_path.ordinality
        LIMIT 1
    ) AS label_property ON TRUE
";

/// The edges link hydration query.
///
/// The link's label and its first direct type URL, input order preserved through the ordinality
/// column, absent entities missing from the result.
///
/// Both columns read the edition cache alone, so this query takes no protected-property parameter.
/// The label carries whatever the cache materialized, under the label rule every surface here
/// shares.
const EDGES_LINK_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        cache.versioned_urls[1] AS first_type_url
    FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS ids (web_id, entity_uuid, index)
    JOIN entity_temporal_metadata AS meta
      ON meta.web_id = ids.web_id
     AND meta.entity_uuid = ids.entity_uuid
     AND meta.draft_id IS NULL
     AND meta.transaction_time @> now()
     AND meta.decision_time @> now()
    JOIN entity_editions AS edition
      ON edition.entity_edition_id = meta.entity_edition_id
     AND NOT edition.archived
    LEFT JOIN entity_edition_cache AS cache
      ON cache.entity_edition_id = meta.entity_edition_id
";

/// A detail hydration failed against the store.
#[derive(Debug)]
pub enum DetailError {
    /// No connection was available for the query.
    Connect(Report<StoreError>),
    /// The store rejected the query.
    Query(tokio_postgres::Error),
}

impl core::fmt::Display for DetailError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Connect(report) => {
                write!(
                    fmt,
                    "the detail hydration reached no store connection: {report}"
                )
            }
            Self::Query(error) => write!(fmt, "the detail hydration failed: {error}"),
        }
    }
}

impl core::error::Error for DetailError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            // A report does not implement `Error`, and its own display carries the chain.
            Self::Connect(_) => None,
            Self::Query(error) => Some(error),
        }
    }
}

/// Live detail reads over the serving store pool.
///
/// The pool is the transport layer's, shared with every other store read the process makes, and the
/// hydration path issues one batched query per request.
///
/// The protected properties are the pool's own setting, so a serving process withholds exactly the
/// properties that process's store protects: one owner for the set, read once.
#[derive(Debug)]
pub struct GraphDatabaseClient {
    pool: Arc<PostgresStorePool>,
    /// The base URLs [`MASKED_PROPERTIES`] removes, bytewise-sorted.
    ///
    /// Sorted so that one deployment binds one parameter value across restarts: the configuration
    /// holds the set in a hash map, whose order is per-process.
    protected: Vec<String>,
}

impl GraphDatabaseClient {
    /// Opens the detail path over the serving store pool.
    ///
    /// The pool's settings name the properties every hydrated trailer withholds.
    #[must_use]
    pub fn new(pool: Arc<PostgresStorePool>) -> Self {
        let mut protected: Vec<String> = pool
            .settings
            .filter_protection
            .protected_properties()
            .map(BaseUrl::as_str)
            .map(str::to_owned)
            .collect();
        protected.sort_unstable();

        Self { pool, protected }
    }

    /// Holds one connection for the duration of one query.
    async fn connection(&self) -> Result<impl AsClient, DetailError> {
        self.pool
            .acquire(None)
            .await
            .map_err(|report| DetailError::Connect(report.change_context(StoreError)))
    }

    /// Hydrates labels and icons for the delivered entities, aligned to the delivered order.
    ///
    /// Entities the store no longer serves read `null`.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain or with the wrong column
    /// types, which is a query bug rather than data.
    #[tracing::instrument(skip_all, fields(points = entities.count()))]
    pub async fn labels_and_icons(
        &self,
        entities: &DeliveredEntities,
    ) -> Result<NodeDetails, DetailError> {
        if entities.ids().is_empty() {
            return Ok(NodeDetails::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(entities.ids());
        let rows = self
            .connection()
            .await?
            .as_client()
            .query(
                DETAIL_QUERY,
                &[&web_ids, &entity_uuids, &self.protected, &ICON_PROPERTY],
            )
            .await
            .map_err(DetailError::Query)?;

        let mut labels = vec![None; entities.count()];
        let mut icons = vec![None; entities.count()];
        for row in rows {
            let index = domain_index(&row);
            let own_icon: Option<String> = row.get(2);
            let type_icon: Option<String> = row.get(3);

            labels[index] = row.get(1);
            icons[index] = own_icon.or(type_icon);
        }

        Ok(NodeDetails::new(labels, icons))
    }

    /// Hydrates the locate response's node columns, aligned to the delivered order.
    ///
    /// Labels and direct-type URLs for every delivered node; the source - the first delivered
    /// entity - additionally hydrates its capped simple-valued properties and their completeness.
    /// Entities the store no longer serves read `null` columns and `false` flags.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain or with the wrong column
    /// types, which is a query bug rather than data.
    #[tracing::instrument(skip_all, fields(points = entities.count()))]
    pub async fn locate_details(
        &self,
        entities: &DeliveredEntities,
        properties: u32,
    ) -> Result<LocateNodeDetails, DetailError> {
        if entities.ids().is_empty() {
            return Ok(LocateNodeDetails::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(entities.ids());
        let rows = self
            .connection()
            .await?
            .as_client()
            .query(
                LOCATE_DETAIL_QUERY,
                &[&web_ids, &entity_uuids, &self.protected],
            )
            .await
            .map_err(DetailError::Query)?;

        let mut labels = vec![None; entities.count()];
        let mut type_url_columns = vec![Vec::new(); entities.count()];
        let mut source_properties = None;
        let mut source_properties_complete = false;
        for row in rows {
            let index = domain_index(&row);
            labels[index] = row.get(1);
            let type_urls: Option<Vec<String>> = row.get(2);
            type_url_columns[index] = type_urls.unwrap_or_default();

            if index == 0 {
                let (survivors, complete) = capped_properties(&row, properties as usize);
                source_properties = Some(survivors);
                source_properties_complete = complete;
            }
        }

        Ok(LocateNodeDetails::new(
            labels,
            type_url_columns,
            source_properties,
            source_properties_complete,
        ))
    }

    /// Hydrates the locate response's link columns in the delivered edge order.
    ///
    /// Every delivered edge hydrates a label together with capped direct-type URLs and capped
    /// simple-valued properties, and a completeness flag accompanies each cap. Links the store no
    /// longer serves read `null` columns and `false` flags.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain or with the wrong column
    /// types, which is a query bug rather than data.
    #[tracing::instrument(skip_all, fields(edges = entities.count()))]
    pub async fn locate_link_details(
        &self,
        entities: &DeliveredEntities,
        type_ids: u32,
        properties: u32,
    ) -> Result<LocateLinkDetails, DetailError> {
        if entities.ids().is_empty() {
            return Ok(LocateLinkDetails::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(entities.ids());
        let rows = self
            .connection()
            .await?
            .as_client()
            .query(
                LOCATE_LINK_QUERY,
                &[&web_ids, &entity_uuids, &self.protected],
            )
            .await
            .map_err(DetailError::Query)?;

        let mut labels = vec![None; entities.count()];
        let mut type_url_columns = vec![Vec::new(); entities.count()];
        let mut type_urls_complete = vec![false; entities.count()];
        let mut properties_columns = vec![None; entities.count()];
        let mut properties_complete = vec![false; entities.count()];
        for row in rows {
            let index = domain_index(&row);
            labels[index] = row.get(1);

            let type_urls: Option<Vec<String>> = row.get(2);
            let mut type_urls = type_urls.unwrap_or_default();
            type_urls_complete[index] = type_urls.len() <= type_ids as usize;
            type_urls.truncate(type_ids as usize);
            type_url_columns[index] = type_urls;

            let (survivors, complete) = capped_properties(&row, properties as usize);
            properties_columns[index] = Some(survivors);
            properties_complete[index] = complete;
        }

        Ok(LocateLinkDetails::new(
            labels,
            type_url_columns,
            type_urls_complete,
            properties_columns,
            properties_complete,
        ))
    }

    /// Hydrates the edges response's link columns, aligned to the delivered edge order.
    ///
    /// Labels and first direct-type URLs. Links the store no longer serves read `null`.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain or with the wrong column
    /// types, which is a query bug rather than data.
    #[tracing::instrument(skip_all, fields(edges = entities.count()))]
    pub async fn link_details(
        &self,
        entities: &DeliveredEntities,
    ) -> Result<EdgeLinkDetails, DetailError> {
        if entities.ids().is_empty() {
            return Ok(EdgeLinkDetails::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(entities.ids());
        let rows = self
            .connection()
            .await?
            .as_client()
            .query(EDGES_LINK_QUERY, &[&web_ids, &entity_uuids])
            .await
            .map_err(DetailError::Query)?;

        let mut labels = vec![None; entities.count()];
        let mut first_type_urls = vec![None; entities.count()];
        for row in rows {
            let index = domain_index(&row);
            labels[index] = row.get(1);
            first_type_urls[index] = row.get(2);
        }

        Ok(EdgeLinkDetails::new(labels, first_type_urls))
    }
}

/// Reads one resolved row's capped properties and their completeness flag.
///
/// The row carries the property columns at fixed positions: `simple` (3), `total` (4), and
/// `label_property` (5). Both columns read the masked object, so completeness attests the
/// **deliverable** set: the survivors are that whole set iff the filter dropped nothing as
/// non-simple and nothing exceeds the cap. A protected property is in neither column and moves the
/// flag not at all - a count taken before masking would have made `total` against the delivered map
/// into the enumeration signal the protection exists to close.
fn capped_properties(row: &tokio_postgres::Row, cap: usize) -> (Vec<(String, SimpleValue)>, bool) {
    let simple: Option<String> = row.get(3);
    let total: Option<i32> = row.get(4);
    let label_property: Option<String> = row.get(5);

    let entries = simple.map_or_else(Vec::new, |json| simple_properties(&json));
    let total = usize::try_from(total.expect("a resolved row aggregates its property count"))
        .expect("property counts are non-negative");
    let complete = entries.len() == total && entries.len() <= cap;

    (
        select_properties(entries, label_property.as_deref(), cap),
        complete,
    )
}

/// Splits archived identities into the query's two uuid arrays.
fn uuid_arrays(ids: &[ArchivedEntityId]) -> (Vec<uuid::Uuid>, Vec<uuid::Uuid>) {
    let uuid = |bytes: &[u8]| {
        uuid::Uuid::from_slice(bytes).expect("archived identities are 16-byte uuids")
    };
    let web_ids = ids.iter().map(|id| uuid(id.web_id.as_bytes())).collect();
    let entity_uuids = ids
        .iter()
        .map(|id| uuid(id.entity_uuid.as_bytes()))
        .collect();

    (web_ids, entity_uuids)
}

/// Reads a result row's request-domain index off the ordinality column.
fn domain_index(row: &tokio_postgres::Row) -> usize {
    let index: i64 = row.get(0);
    // Ordinality is 1-based; an index outside the request domain
    // cannot arrive from the unnest.
    usize::try_from(index - 1).expect("ordinality covers the request domain")
}

#[cfg(test)]
mod tests {
    use super::{
        DETAIL_QUERY, EDGES_LINK_QUERY, ICON_PROPERTY, LOCATE_DETAIL_QUERY, LOCATE_LINK_QUERY,
        MASKED_PROPERTIES,
    };

    /// The function whose call is the one read of the unmasked object.
    ///
    /// The label lateral resolves which `labelProperty` path produced the label, so it reads the
    /// object the label cache read and delivers no value from it.
    const LABEL_ATTRIBUTION: &str = "jsonb_extract_path(";

    /// Every hydration query, with whether it reads the entity's properties object.
    const QUERIES: [(&str, &str, bool); 4] = [
        ("DETAIL_QUERY", DETAIL_QUERY, true),
        ("LOCATE_DETAIL_QUERY", LOCATE_DETAIL_QUERY, true),
        ("LOCATE_LINK_QUERY", LOCATE_LINK_QUERY, true),
        ("EDGES_LINK_QUERY", EDGES_LINK_QUERY, false),
    ];

    /// Returns the offset of each read of `edition.properties` that is neither masked nor
    /// attribution.
    ///
    /// The mask covers a read when the whole [`MASKED_PROPERTIES`] spelling, opening paren
    /// included, stands at the occurrence.
    fn unmasked_reads(query: &str) -> Vec<usize> {
        let bytes = query.as_bytes();

        query
            .match_indices("edition.properties")
            .filter(|&(at, _)| {
                let masked = at > 0 && bytes[at - 1..].starts_with(MASKED_PROPERTIES.as_bytes());
                let attributed = bytes[..at].ends_with(LABEL_ATTRIBUTION.as_bytes());

                !masked && !attributed
            })
            .map(|(at, _)| at)
            .collect()
    }

    /// Every property value a query reads comes from the masked object.
    ///
    /// The one exception is the label lateral's existence test, which reads the unmasked object to
    /// attribute the label and delivers nothing from it.
    #[test]
    fn every_property_read_is_masked() {
        for (name, query, reads_properties) in QUERIES {
            assert_eq!(
                unmasked_reads(query),
                Vec::<usize>::new(),
                "{name} reads `edition.properties` outside `MASKED_PROPERTIES`, at these offsets"
            );

            assert_eq!(
                query.contains(MASKED_PROPERTIES),
                reads_properties,
                "{name} disagrees with its census row about reading the properties object"
            );
        }
    }

    /// A query that masks binds the protected array at `$3`, and one that does not binds no `$3`.
    ///
    /// The mask contains a parameter index, so every query has to pass its protected set at that
    /// same index - and the icon's own parameter sits after it.
    #[test]
    fn the_masked_parameter_index_is_uniform() {
        for (name, query, reads_properties) in QUERIES {
            assert_eq!(
                query.contains("$3"),
                reads_properties,
                "{name} disagrees with its census row about binding `$3`"
            );
        }

        assert!(
            DETAIL_QUERY.contains("$4::text"),
            "the icon's base URL binds after the protected array"
        );
        assert!(
            !LOCATE_DETAIL_QUERY.contains("$4") && !LOCATE_LINK_QUERY.contains("$4"),
            "the locate queries bind nothing past the protected array"
        );
        assert!(
            ICON_PROPERTY.ends_with("/icon/"),
            "the icon parameter names the icon property"
        );
    }

    /// The census above covers every query constant in this module.
    ///
    /// Nothing else would mask a fifth query or witness it, and the source is the only place that
    /// knows how many there are.
    #[test]
    fn the_census_covers_every_query() {
        let mut declared: Vec<&str> = include_str!("client.rs")
            .lines()
            .filter_map(|line| line.strip_prefix("const "))
            .filter_map(|line| line.split_once(": &str"))
            .map(|(name, _)| name)
            .filter(|name| name.ends_with("_QUERY"))
            .collect();
        declared.sort_unstable();

        let mut censused: Vec<&str> = QUERIES.iter().map(|&(name, _, _)| name).collect();
        censused.sort_unstable();

        assert_eq!(
            declared, censused,
            "the query census does not match this module's query constants"
        );
    }
}
