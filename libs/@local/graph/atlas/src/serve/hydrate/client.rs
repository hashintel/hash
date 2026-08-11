//! The store boundary.
//!
//! Live detail reads over the serving store pool.
//!
//! One batched query per request, input order preserved through the ordinality column, absent
//! entities missing from the result. Each query borrows a connection for its own duration and
//! returns it, so a request's hydration waits only on the store's own work.
//!
//! Every read of an entity's properties object passes through the masking subtraction the
//! statements module constructs, so a protected property reaches no properties column of any
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
    statements::{DetailRows, LocateColumns, edges_link_statement, locate_statement},
};
use crate::{bitset::DenseBitSlice, dataset::postgres::id::ArchivedEntityId};

/// A detail hydration failed against the store.
#[derive(Debug)]
pub(crate) enum DetailError {
    /// No connection was available for the query.
    Connect(Report<StoreError>),
    /// The store rejected the query.
    Query(tokio_postgres::Error),
    /// The channel carrying the answer closed before it arrived.
    ///
    /// The party holding the store side of the order dropped it, which happens when its request
    /// ends early, so no answer can reach the response either way.
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
        let statement = locate_statement(
            &web_ids,
            &entity_uuids,
            &self.protected,
            DetailRows::SourceOnly,
        );
        let rows = self
            .connection()
            .await?
            .as_client()
            .query(&statement.sql, &statement.parameters)
            .await
            .map_err(DetailError::Query)?;

        let mut resolved = DenseBitSet::new_empty(ids.len());
        let mut type_url_columns: IdVec<NodeSlot, Vec<VersionedUrl>> =
            IdVec::from_elem(Vec::new(), ids.len());
        let mut source_properties = None;
        let mut source_properties_complete = false;
        for row in rows {
            let index = {
                let index: i64 = row.get(statement.columns.index);
                usize::try_from(index - 1).expect("ordinality covers the request domain")
            };
            let slot = NodeSlot::from_usize(index);

            resolved.insert(slot);

            let type_urls: Option<Vec<VersionedUrl>> = row.get(statement.columns.type_urls);
            type_url_columns[slot] = type_urls.unwrap_or_default();

            if index == 0 {
                let (survivors, complete) =
                    capped_properties(&row, &statement.columns, properties as usize);
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
        let statement = locate_statement(
            &web_ids,
            &entity_uuids,
            &self.protected,
            DetailRows::EveryRow,
        );
        let rows = self
            .connection()
            .await?
            .as_client()
            .query(&statement.sql, &statement.parameters)
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
                let index: i64 = row.get(statement.columns.index);
                usize::try_from(index - 1).expect("ordinality covers the request domain")
            };
            let slot = EdgeSlot::from_usize(index);

            let type_urls: Option<Vec<VersionedUrl>> = row.get(statement.columns.type_urls);
            let mut type_urls = type_urls.unwrap_or_default();
            if type_urls.len() <= type_ids as usize {
                type_urls_complete.insert(slot);
            }
            type_urls.truncate(type_ids as usize);
            type_url_columns[slot] = type_urls;

            let (survivors, complete) =
                capped_properties(&row, &statement.columns, properties as usize);
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
        let statement = edges_link_statement(&web_ids, &entity_uuids);
        let rows = self
            .connection()
            .await?
            .as_client()
            .query(&statement.sql, &statement.parameters)
            .await
            .map_err(DetailError::Query)?;

        let mut first_type_urls: IdVec<EdgeSlot, Option<VersionedUrl>> =
            IdVec::from_elem(None, ids.len());
        for row in rows {
            let index = {
                let index: i64 = row.get(statement.columns.index);
                usize::try_from(index - 1).expect("ordinality covers the request domain")
            };
            let slot = EdgeSlot::from_usize(index);

            first_type_urls[slot] = row.get(statement.columns.first_type_url);
        }

        Ok(first_type_urls)
    }
}

/// Reads one resolved row's capped properties and their completeness flag.
///
/// The row carries the property columns at the positions the statement's select list assigned.
/// Both columns read the masked object, so completeness attests the **deliverable** set: the
/// survivors are that whole set iff the filter dropped nothing as non-simple and nothing exceeds
/// the cap. A protected property is in neither column and moves the flag not at all - a count
/// taken before masking would have made `total` against the delivered map into the enumeration
/// signal the protection exists to close.
fn capped_properties(
    row: &tokio_postgres::Row,
    columns: &LocateColumns,
    cap: usize,
) -> (Vec<(BaseUrl, SimpleValue)>, bool) {
    let simple: Option<serde_json::Value> = row.get(columns.simple);
    let total: Option<i32> = row.get(columns.total);
    let label_property: Option<BaseUrl> = row.get(columns.label_property);

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
