//! The store boundary.
//!
//! Live detail reads over the serving store pool.
//!
//! Each hydration resolves its identities through the store's own query compiler, so a
//! statement carries the read path's semantics by construction: the live temporal axes, the
//! draft exclusion, and the per-actor property masking. A property value leaves the store
//! masked for the requesting actor under exactly the conditions the graph's entity reads mask
//! it - the deployment configures protection and the actor is not an instance admin - and
//! [`MaskingActor`] carries that actor from the scope's policy resolution into every order.
//! Label attribution reads the store's per-edition cache and no property value, so it stands
//! outside the masking, as labels do on the graph's own read path: see the trailer contract
//! in [the module above](super).
//!
//! Each hydration borrows one connection for its own duration and returns it, and statements
//! sharing the connection pipeline, so a request's hydration waits on one round trip of the
//! store's own work.

use alloc::sync::Arc;
use core::pin::pin;

use error_stack::Report;
use futures::{StreamExt as _, TryStreamExt as _};
use hash_graph_postgres_store::store::{
    AsClient, PostgresStorePool, error::StoreError, postgres::query::SelectCompiler,
};
use hash_graph_store::{
    filter::protection::PropertyProtectionFilter,
    pool::StorePool as _,
    subgraph::temporal_axes::{QueryTemporalAxes, QueryTemporalAxesUnresolved},
};
use hashql_core::{
    collections::FastHashMap,
    id::{Id as _, IdSlice, IdVec, bit_vec::DenseBitSet},
};
use tokio::try_join;
use tokio_postgres::GenericClient;
use type_system::{
    knowledge::entity::id::EntityId,
    ontology::id::{BaseUrl, VersionedUrl},
    principal::actor::ActorId,
};

use super::{
    columns::{EdgeSlot, NodeSlot, ScalarValue},
    order::{LocateLinkHydration, LocateNodeHydration},
    statements::{DetailColumns, TypeColumns, identity_filter},
};
use crate::{bitset::DenseBitSlice, dataset::postgres::id::ArchivedEntityId};

/// The resolved actor one hydration masks properties for.
///
/// Property protection is a per-actor condition on the graph's read path, so a hydration
/// carries the actor identity the scope's policy resolution produced.
#[derive(Debug, Copy, Clone)]
pub(crate) struct MaskingActor {
    /// The actor id the policy resolution produced, `None` for the public actor.
    ///
    /// The filter vocabulary binds the nil uuid for `None`, which is the type system's own
    /// public-actor value, so the absent case masks as an actor owning nothing.
    pub id: Option<ActorId>,
    /// Whether the actor is an instance admin, whose reads bypass property protection.
    pub instance_admin: bool,
}

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
    /// The query returned too many rows.
    TooManyRows,
}

impl From<tokio_postgres::Error> for DetailError {
    fn from(value: tokio_postgres::Error) -> Self {
        Self::Query(value)
    }
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
            Self::TooManyRows => fmt.write_str("the detail hydration returned too many rows"),
        }
    }
}

impl core::error::Error for DetailError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Query(error) => Some(error),
            Self::Connect(_) | Self::Disconnected | Self::TooManyRows => None,
        }
    }
}

/// Reads every requested identity's resolution flag and direct-type URLs.
///
/// # Panics
///
/// This panics when the store answers rows outside the request domain, when a column does not
/// decode at its assigned position, or when a stored URL does not parse as its domain type.
async fn read_types(
    client: &impl GenericClient,
    ids: &IdSlice<NodeSlot, ArchivedEntityId>,
    temporal_axes: &QueryTemporalAxes,
) -> Result<(DenseBitSet<NodeSlot>, IdVec<NodeSlot, Vec<VersionedUrl>>), DetailError> {
    let filter = identity_filter(ids.iter().copied().map(EntityId::from));

    let mut compiler = SelectCompiler::new(Some(temporal_axes), false);
    compiler
        .add_filter(&filter)
        .expect("the identity filter compiles against the entity query paths");

    let columns = TypeColumns::select(&mut compiler);
    let (statement, parameters) = compiler.compile();

    let rows = client.query_raw(&statement, parameters).await?;

    let lookup: FastHashMap<_, _> = ids
        .iter_enumerated()
        .map(|(slot, &id)| (id, slot))
        .collect();

    let mut resolved = DenseBitSet::new_empty(ids.len());
    let mut type_urls: IdVec<_, _> = IdVec::from_elem(Vec::new(), ids.len());

    let mut rows = pin!(rows);
    while let Some(row) = rows.next().await {
        let row = row?;
        let slot = lookup[&columns.entity_id(&row)];

        if resolved.insert(slot) {
            type_urls[slot].extend(columns.direct_type_urls(&row));
        }
    }

    Ok((resolved, type_urls))
}

/// Reads one identity's capped properties and their completeness.
///
/// `None` when the store no longer serves the identity.
///
/// # Panics
///
/// This panics when a column does not decode at its assigned position, and when a stored key
/// does not parse as a base URL.
async fn read_detail(
    client: &(impl GenericClient + Sync),
    source: ArchivedEntityId,
    protection: Option<&PropertyProtectionFilter<'_, '_>>,
    cap: usize,
    temporal_axes: &QueryTemporalAxes,
) -> Result<(Option<Vec<(BaseUrl, ScalarValue)>>, bool), DetailError> {
    let filter = identity_filter([source.into()]);

    let mut compiler = SelectCompiler::new(Some(temporal_axes), false);
    compiler
        .add_filter(&filter)
        .expect("the identity filter compiles against the entity query paths");

    let columns = DetailColumns::select(&mut compiler, protection);
    let (statement, parameters) = compiler.compile();

    let stream = client.query_raw(&statement, parameters).await?;
    let mut stream = pin!(stream);
    let Some(row) = stream.try_next().await? else {
        return Ok((None, false));
    };

    if stream.try_next().await?.is_some() {
        return Err(DetailError::TooManyRows);
    }

    let (properties, complete) = columns.capped_properties(&row, cap);
    Ok((Some(properties), complete))
}

/// Live detail reads over the serving store pool.
///
/// The pool's settings carry the deployment's property protection, so a serving process masks
/// exactly the properties that process's store protects.
#[derive(Debug)]
pub(crate) struct GraphDatabaseClient {
    pool: Arc<PostgresStorePool>,
}

impl GraphDatabaseClient {
    /// Opens the detail path over the serving store pool.
    #[must_use]
    pub(crate) const fn new(pool: Arc<PostgresStorePool>) -> Self {
        Self { pool }
    }

    /// Holds one connection for the duration of one hydration.
    async fn connection(&self) -> Result<impl AsClient, DetailError> {
        self.pool
            .acquire(None)
            .await
            .map_err(|report| DetailError::Connect(report.change_context(StoreError)))
    }

    /// Returns the property protection masking `masking`'s reads, absent when nothing masks.
    fn protection(&self, masking: MaskingActor) -> Option<PropertyProtectionFilter<'_, '_>> {
        let config = &self.pool.settings.filter_protection;
        (!config.is_empty() && !masking.instance_admin)
            .then(|| config.to_property_protection_filter(masking.id))
    }

    /// Answers the node half of one locate order.
    ///
    /// Every resolved node reads its resolution flag and direct-type URLs. The source, the first
    /// delivered identity, also reads its capped scalar-valued properties and their completeness,
    /// masked for `masking`'s actor. Entities the store no longer serves read `false` flags and
    /// empty columns.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects a query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain, when a column does
    /// not decode at its assigned position, or when a stored URL does not parse as its domain
    /// type.
    #[tracing::instrument(skip_all, fields(points = ids.len()))]
    pub(crate) async fn locate_node_hydration(
        &self,
        ids: &IdSlice<NodeSlot, ArchivedEntityId>,
        properties: u32,
        masking: MaskingActor,
    ) -> Result<LocateNodeHydration, DetailError> {
        if ids.is_empty() {
            return Ok(LocateNodeHydration::empty(0));
        }

        let connection = self.connection().await?;
        let client = connection.as_client();

        let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
        let protection = self.protection(masking);

        let ((resolved, type_urls), (source_properties, source_properties_complete)) = try_join!(
            read_types(client, ids, &temporal_axes),
            read_detail(
                client,
                ids[NodeSlot::MIN],
                protection.as_ref(),
                properties as usize,
                &temporal_axes,
            ),
        )?;

        Ok(LocateNodeHydration {
            resolved,
            type_urls,
            source_properties,
            source_properties_complete,
        })
    }

    /// Answers the link half of one locate order.
    ///
    /// Every resolved edge reads capped direct-type URLs and capped scalar-valued properties,
    /// masked for `masking`'s actor, and a completeness flag accompanies each cap. Links the
    /// store no longer serves read `None` properties, empty types, and `false` flags.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain, when a column does
    /// not decode at its assigned position, or when a stored URL does not parse as its domain
    /// type.
    #[tracing::instrument(skip_all, fields(edges = ids.len()))]
    pub(crate) async fn locate_link_hydration(
        &self,
        ids: &IdSlice<EdgeSlot, ArchivedEntityId>,
        type_ids: u32,
        properties: u32,
        masking: MaskingActor,
    ) -> Result<LocateLinkHydration, DetailError> {
        if ids.is_empty() {
            return Ok(LocateLinkHydration::empty(0));
        }

        let connection = self.connection().await?;
        let client = connection.as_client();

        let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();

        let filter = identity_filter(ids.iter().copied().map(EntityId::from));
        let protection = self.protection(masking);
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), false);
        compiler
            .add_filter(&filter)
            .expect("the identity filter compiles against the entity query paths");

        let columns = DetailColumns::select(&mut compiler, protection.as_ref());
        let (statement, parameters) = compiler.compile();

        let rows = client.query_raw(&statement, parameters).await?;

        let lookup: FastHashMap<_, _> = ids
            .iter_enumerated()
            .map(|(slot, id)| (*id, slot))
            .collect();

        let mut type_url_columns: IdVec<_, _> = IdVec::from_elem(Vec::new(), ids.len());
        let mut type_urls_complete = DenseBitSlice::new_empty(ids.len());

        let mut properties_columns: IdVec<_, _> = IdVec::from_elem(None, ids.len());
        let mut properties_complete = DenseBitSlice::new_empty(ids.len());

        let mut rows = pin!(rows);
        while let Some(row) = rows.next().await {
            let row = row?;
            let slot = lookup[&columns.entity_id(&row)];

            let mut type_urls = columns.direct_type_urls(&row);
            type_urls_complete.set(slot, type_urls.len() <= (type_ids as usize));

            type_urls.truncate(type_ids as usize);
            type_url_columns[slot].extend(type_urls);

            let (survivors, complete) = columns.capped_properties(&row, properties as usize);

            properties_columns.insert(slot, survivors);
            properties_complete.set(slot, complete);
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
    /// serves or records no types for read `None`. The read touches no property value, so it
    /// takes no masking actor.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain, when a column does
    /// not decode at its assigned position, or when a stored URL does not parse as its domain
    /// type.
    #[tracing::instrument(skip_all, fields(edges = ids.len()))]
    pub(crate) async fn edges_link_hydration(
        &self,
        ids: &IdSlice<EdgeSlot, ArchivedEntityId>,
    ) -> Result<IdVec<EdgeSlot, Option<VersionedUrl>>, DetailError> {
        if ids.is_empty() {
            return Ok(IdVec::new());
        }

        let connection = self.connection().await?;
        let client = connection.as_client();

        let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();

        let filter = identity_filter(ids.iter().copied().map(EntityId::from));
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), false);
        compiler
            .add_filter(&filter)
            .expect("the identity filter compiles against the entity query paths");

        let columns = TypeColumns::select(&mut compiler);
        let (statement, parameters) = compiler.compile();

        let rows = client.query_raw(&statement, parameters).await?;

        let lookup: FastHashMap<_, _> = ids
            .iter_enumerated()
            .map(|(slot, id)| (*id, slot))
            .collect();
        let mut first_type_urls: IdVec<_, _> = IdVec::from_elem(None, ids.len());

        let mut rows = pin!(rows);
        while let Some(row) = rows.next().await {
            let row = row?;
            let slot = lookup[&columns.entity_id(&row)];

            first_type_urls[slot] = columns.direct_type_urls(&row).into_iter().next();
        }

        Ok(first_type_urls)
    }
}
