//! The store boundary: live detail reads over the serving store pool.
//!
//! One batched query per request, input order preserved through the ordinality column, absent
//! entities simply missing from the result. A connection is held for the duration of one query and
//! returned, so a request's hydration waits only on the store's own work.

use alloc::sync::Arc;

use error_stack::Report;
use hash_graph_postgres_store::store::{AsClient, PostgresStorePool, error::StoreError};
use hash_graph_store::pool::StorePool as _;
use tokio_postgres::GenericClient as _;
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

/// The tile hydration query.
///
/// One batched lookup, input order preserved through the ordinality column, absent entities simply
/// missing from the result.
const DETAIL_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        CASE
            WHEN jsonb_typeof(edition.properties -> $3::text) = 'string'
                THEN edition.properties ->> $3::text
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
    LEFT JOIN LATERAL (
        SELECT display.value ->> 'icon' AS icon
        FROM unnest(cache.versioned_urls[1:cache.direct_types])
            WITH ORDINALITY AS direct (url, position)
        JOIN ontology_ids
          ON ontology_ids.base_url || 'v/' || ontology_ids.version = direct.url
        JOIN entity_types
          ON entity_types.ontology_id = ontology_ids.ontology_id
        CROSS JOIN LATERAL jsonb_array_elements(
            entity_types.closed_schema -> 'allOf'
        ) AS display (value)
        WHERE display.value ->> 'icon' IS NOT NULL
        ORDER BY (display.value ->> 'depth')::int, direct.position
        LIMIT 1
    ) AS type_icon ON TRUE
";

/// The locate node hydration query.
///
/// Labels and direct-type URLs for every delivered node, plus - gated to the first input, the
/// source - the simple-valued properties, the whole-set property count, and the base URL
/// providing the display label. Input order preserved through the ordinality column, absent
/// entities simply missing from the result.
///
/// The `simple` column aggregates only simple-typed values - the filter runs in the store, so
/// nested values never cross the connection - while `total` counts the unfiltered set, the
/// completeness flag's ground truth. The `label_property` lateral mirrors the
/// `entity_edition_cache` label derivation (migration V51): the first `allOf` `labelProperty` path
/// that resolves non-null, in canonical direct-type order, is the path behind `labels[1]`.
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
        FROM jsonb_each(edition.properties) AS prop (key, value)
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
/// flags.
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
        FROM jsonb_each(edition.properties) AS prop (key, value)
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
/// The bulk surface's lean columns: the link's label and its first direct type URL, input order
/// preserved through the ordinality column, absent entities simply missing from the result.
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
            // A report is not an `Error`; its own display carries the chain.
            Self::Connect(_) => None,
            Self::Query(error) => Some(error),
        }
    }
}

/// Live detail reads over the serving store pool.
///
/// The pool is the transport layer's, shared with every other store read the process makes, and the
/// hydration path issues one batched query per request.
#[derive(Debug)]
pub struct GraphDatabaseClient {
    pool: Arc<PostgresStorePool>,
}

impl GraphDatabaseClient {
    /// Wraps an established store connection.
    #[must_use]
    pub const fn new(pool: Arc<PostgresStorePool>) -> Self {
        Self { pool }
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
    /// Panics when the store answers rows outside the request domain or with the wrong column
    /// types: a query bug, never data.
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
            .query(DETAIL_QUERY, &[&web_ids, &entity_uuids, &ICON_PROPERTY])
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
    /// Panics when the store answers rows outside the request domain or with the wrong column
    /// types: a query bug, never data.
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
            .query(LOCATE_DETAIL_QUERY, &[&web_ids, &entity_uuids])
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

    /// Hydrates the locate response's link columns, aligned to the delivered edge order.
    ///
    /// Every delivered edge hydrates its label, its capped direct-type URLs, and its capped
    /// simple-valued properties, each cap paired with a completeness flag. Links the store no
    /// longer serves read `null` columns and `false` flags.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// Panics when the store answers rows outside the request domain or with the wrong column
    /// types: a query bug, never data.
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
            .query(LOCATE_LINK_QUERY, &[&web_ids, &entity_uuids])
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
    /// Labels and first direct-type URLs; links the store no longer serves read `null`.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// Panics when the store answers rows outside the request domain or with the wrong column
    /// types: a query bug, never data.
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
/// `label_property` (5). Completeness reads BEFORE the cap: the survivors are the whole set iff
/// nothing was filtered as non-simple and nothing exceeds the cap.
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
