//! The store boundary.
//!
//! Live detail reads over the serving store pool.
//!
//! One batched query per request, input order preserved through the ordinality column, absent
//! entities missing from the result. Each query borrows a connection for its own duration and
//! returns it, so a request's hydration waits only on the store's own work.
//!
//! Every read of an entity's properties object passes through the masking subtraction
//! `edition.properties - $3::text[]`, so a protected property reaches no properties column of any
//! trailer. A label is a materialized property value and stands outside that rule, as it does on
//! the graph's own read path: see the trailer contract in [the module above](super).

use alloc::sync::Arc;

use error_stack::Report;
use hash_graph_postgres_store::store::{AsClient, PostgresStorePool, error::StoreError};
use hash_graph_store::pool::StorePool as _;
use hashql_core::id::{Id, IdSlice, IdVec, bit_vec::DenseBitSet};
use tokio_postgres::GenericClient as _;
use type_system::ontology::id::{BaseUrl, VersionedUrl};
use zerocopy::IntoBytes as _;

use super::{
    columns::{EdgeSlot, NodeSlot, SimpleValue},
    order::{LocateLinkHydration, LocateNodeHydration},
    select::{select_properties, simple_properties},
};
use crate::{bitset::DenseBitSlice, dataset::postgres::id::ArchivedEntityId};

/// The locate node hydration query.
///
/// Direct-type URLs for every delivered node, plus - gated to the first input, the source - the
/// simple-valued properties, the whole-set property count, and the base URL providing the display
/// label. Input order preserved through the ordinality column, absent entities missing from the
/// result.
///
/// The `simple` column aggregates only simple-typed values - the filter runs in the store, so
/// nested values never cross the connection - while `total` counts the whole masked object, the
/// completeness flag's ground truth. Both read the masked object, so a protected property is absent
/// from the map and absent from the count. Completeness attests the deliverable set, and `total`
/// against the delivered map is no signal that a withheld property exists.
///
/// The `label_property` lateral mirrors the `entity_edition_cache` label derivation (migration
/// V51). The path behind `labels[1]` is the first `allOf` `labelProperty` path that resolves
/// non-null in canonical direct-type order. It reads the *unmasked* object on purpose - masking it
/// would attribute the label to the next candidate path instead of the one that produced it - and
/// it delivers no value, only the path's own name.
const LOCATE_DETAIL_QUERY: &str = "
    SELECT
        ids.index,
        cache.versioned_urls[1:cache.direct_types] AS type_urls,
        props.simple AS simple,
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
/// The locate node query's columns for every delivered link entity, ungated. Every edge in a
/// locate response carries its direct-type URLs and capped properties, and a completeness flag
/// accompanies each cap. Properties and their count read the masked object exactly as the node
/// query reads them.
const LOCATE_LINK_QUERY: &str = "
    SELECT
        ids.index,
        cache.versioned_urls[1:cache.direct_types] AS type_urls,
        props.simple AS simple,
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
/// Each link's first direct-type versioned URL, input order preserved through the ordinality
/// column, absent entities missing from the result.
///
/// The column reads the edition cache alone, so this query takes no protected-property parameter.
const EDGES_LINK_QUERY: &str = "
    SELECT
        ids.index,
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
pub(crate) enum DetailError {
    /// No connection was available for the query.
    Connect(Report<StoreError>),
    /// The store rejected the query.
    Query(tokio_postgres::Error),
    /// The channel carrying the answer closed before it arrived.
    ///
    /// The party holding the store side of the order is gone, which happens when its request ends
    /// early, so no answer can reach the response either way.
    Disconnected,
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
            Self::Disconnected => {
                fmt.write_str("the hydration channel closed before an answer arrived")
            }
        }
    }
}

impl core::error::Error for DetailError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            // A report does not implement `Error`, and its own display carries the chain.
            Self::Query(error) => Some(error),
            Self::Connect(_) | Self::Disconnected => None,
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
    /// The base URLs the masking subtraction removes, bytewise-sorted.
    ///
    /// Sorted so that one deployment binds one parameter value across restarts: the configuration
    /// holds the set in a hash map, whose order is per-process.
    protected: Vec<BaseUrl>,
}

impl GraphDatabaseClient {
    /// Opens the detail path over the serving store pool.
    ///
    /// The pool's settings name the properties every hydrated trailer withholds.
    #[must_use]
    pub fn new(pool: Arc<PostgresStorePool>) -> Self {
        let mut protected: Vec<BaseUrl> = pool
            .settings
            .filter_protection
            .protected_properties()
            .cloned()
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

    /// Answers the node half of one locate order.
    ///
    /// Every resolved node reads its resolution flag and direct-type URLs. The source, the first
    /// delivered identity, also reads its capped simple-valued properties and their completeness.
    /// Entities the store no longer serves read `false` flags and empty columns.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain or with the wrong column
    /// types, which is a query bug rather than data, and when a stored URL does not parse as its
    /// domain type, which is a store-contract violation.
    #[tracing::instrument(skip_all, fields(points = ids.len()))]
    pub(crate) async fn locate_node_hydration(
        &self,
        ids: &IdSlice<NodeSlot, ArchivedEntityId>,
        properties: u32,
    ) -> Result<LocateNodeHydration, DetailError> {
        if ids.is_empty() {
            return Ok(LocateNodeHydration::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(ids);
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

        let mut resolved = DenseBitSet::new_empty(ids.len());
        let mut type_url_columns: IdVec<NodeSlot, Vec<VersionedUrl>> =
            IdVec::from_elem(Vec::new(), ids.len());
        let mut source_properties = None;
        let mut source_properties_complete = false;
        for row in rows {
            let index = {
                let index: i64 = row.get(0);
                usize::try_from(index - 1).expect("ordinality covers the request domain")
            };
            let slot = NodeSlot::from_usize(index);

            resolved.insert(slot);

            let type_urls: Option<Vec<VersionedUrl>> = row.get(1);
            type_url_columns[slot] = type_urls.unwrap_or_default();

            if index == 0 {
                let (survivors, complete) = capped_properties(&row, properties as usize);
                source_properties = Some(survivors);
                source_properties_complete = complete;
            }
        }

        Ok(LocateNodeHydration {
            resolved,
            type_urls: type_url_columns,
            source_properties,
            source_properties_complete,
        })
    }

    /// Answers the link half of one locate order.
    ///
    /// Every resolved edge reads capped direct-type URLs and capped simple-valued properties, and
    /// a completeness flag accompanies each cap. Links the store no longer serves read `None`
    /// properties, empty types, and `false` flags.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain or with the wrong column
    /// types, which is a query bug rather than data, and when a stored URL does not parse as its
    /// domain type, which is a store-contract violation.
    #[tracing::instrument(skip_all, fields(edges = ids.len()))]
    pub(crate) async fn locate_link_hydration(
        &self,
        ids: &IdSlice<EdgeSlot, ArchivedEntityId>,
        type_ids: u32,
        properties: u32,
    ) -> Result<LocateLinkHydration, DetailError> {
        if ids.is_empty() {
            return Ok(LocateLinkHydration::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(ids);
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

        let mut type_url_columns: IdVec<EdgeSlot, Vec<VersionedUrl>> =
            IdVec::from_elem(Vec::new(), ids.len());
        let mut type_urls_complete = DenseBitSlice::new_empty(ids.len());
        let mut properties_columns: IdVec<EdgeSlot, Option<Vec<(BaseUrl, SimpleValue)>>> =
            IdVec::from_elem(None, ids.len());
        let mut properties_complete = DenseBitSlice::new_empty(ids.len());
        for row in rows {
            let index = {
                let index: i64 = row.get(0);
                usize::try_from(index - 1).expect("ordinality covers the request domain")
            };
            let slot = EdgeSlot::from_usize(index);

            let type_urls: Option<Vec<VersionedUrl>> = row.get(1);
            let mut type_urls = type_urls.unwrap_or_default();
            if type_urls.len() <= type_ids as usize {
                type_urls_complete.insert(slot);
            }
            type_urls.truncate(type_ids as usize);
            type_url_columns[slot] = type_urls;

            let (survivors, complete) = capped_properties(&row, properties as usize);
            properties_columns[slot] = Some(survivors);
            if complete {
                properties_complete.insert(slot);
            }
        }

        Ok(LocateLinkHydration {
            type_urls: type_url_columns,
            type_urls_complete,
            properties: properties_columns,
            properties_complete,
        })
    }

    /// Answers the link half of one edges order.
    ///
    /// Each delivered link reads its first direct-type versioned URL. Links the store no longer
    /// serves or records no types for read `None`.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain or with the wrong column
    /// types, which is a query bug rather than data, and when a stored URL does not parse as its
    /// domain type, which is a store-contract violation.
    #[tracing::instrument(skip_all, fields(edges = ids.len()))]
    pub(crate) async fn edges_link_hydration(
        &self,
        ids: &IdSlice<EdgeSlot, ArchivedEntityId>,
    ) -> Result<IdVec<EdgeSlot, Option<VersionedUrl>>, DetailError> {
        if ids.is_empty() {
            return Ok(IdVec::new());
        }

        let (web_ids, entity_uuids) = uuid_arrays(ids);
        let rows = self
            .connection()
            .await?
            .as_client()
            .query(EDGES_LINK_QUERY, &[&web_ids, &entity_uuids])
            .await
            .map_err(DetailError::Query)?;

        let mut first_type_urls: IdVec<EdgeSlot, Option<VersionedUrl>> =
            IdVec::from_elem(None, ids.len());
        for row in rows {
            let index = {
                let index: i64 = row.get(0);
                usize::try_from(index - 1).expect("ordinality covers the request domain")
            };
            let slot = EdgeSlot::from_usize(index);

            first_type_urls[slot] = row.get(1);
        }

        Ok(first_type_urls)
    }
}

/// Reads one resolved row's capped properties and their completeness flag.
///
/// The row carries the property columns at fixed positions: `simple` (2), `total` (3), and
/// `label_property` (4). Both columns read the masked object, so completeness attests the
/// **deliverable** set: the survivors are that whole set iff the filter dropped nothing as
/// non-simple and nothing exceeds the cap. A protected property is in neither column and moves the
/// flag not at all - a count taken before masking would have made `total` against the delivered map
/// into the enumeration signal the protection exists to close.
fn capped_properties(row: &tokio_postgres::Row, cap: usize) -> (Vec<(BaseUrl, SimpleValue)>, bool) {
    let simple: Option<serde_json::Value> = row.get(2);
    let total: Option<i32> = row.get(3);
    let label_property: Option<BaseUrl> = row.get(4);

    let entries = simple.map_or_else(Vec::new, simple_properties);
    let total = usize::try_from(total.expect("a resolved row aggregates its property count"))
        .expect("property counts are non-negative");
    let complete = entries.len() == total && entries.len() <= cap;

    (
        select_properties(entries, label_property.as_ref(), cap),
        complete,
    )
}

/// Splits archived identities into the query's two uuid arrays.
fn uuid_arrays<I: Id>(ids: &IdSlice<I, ArchivedEntityId>) -> (Vec<uuid::Uuid>, Vec<uuid::Uuid>) {
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

#[cfg(test)]
mod tests {
    use super::{EDGES_LINK_QUERY, LOCATE_DETAIL_QUERY, LOCATE_LINK_QUERY};

    /// The function whose call is the one read of the unmasked object.
    ///
    /// The label lateral resolves which `labelProperty` path produced the label, so it reads the
    /// object the label cache read and delivers no value from it.
    const LABEL_ATTRIBUTION: &str = "jsonb_extract_path(";

    const MASKED_PROPERTIES: &str = "(edition.properties - $3::text[])";

    /// Every hydration query, with whether it reads the entity's properties object.
    const QUERIES: [(&str, &str, bool); 3] = [
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
    /// same index.
    #[test]
    fn masked_parameter_index_is_uniform() {
        for (name, query, reads_properties) in QUERIES {
            assert_eq!(
                query.contains("$3"),
                reads_properties,
                "{name} disagrees with its census row about binding `$3`"
            );
        }

        assert!(
            !LOCATE_DETAIL_QUERY.contains("$4") && !LOCATE_LINK_QUERY.contains("$4"),
            "the locate queries bind nothing past the protected array"
        );
    }

    /// The census above covers every query constant in this module.
    ///
    /// Nothing else would mask a fifth query or witness it, and the source is the only place that
    /// knows how many there are.
    #[test]
    fn census_covers_every_query() {
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
