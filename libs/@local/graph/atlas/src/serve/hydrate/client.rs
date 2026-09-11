//! The store boundary.
//!
//! Live detail reads over the serving store pool.
//!
//! Each hydration resolves its identities through the store's own query compiler, so a
//! statement reads under the live temporal axes and the draft exclusion and masks properties
//! per actor, by construction. A property value leaves the store
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
    filter::{
        Filter,
        protection::{PropertyProtectionFilter, PropertyProtectionFilterConfig},
    },
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
    ontology::{
        entity_type::EntityTypeUuid,
        id::{BaseUrl, OntologyTypeUuid, VersionedUrl},
    },
    principal::actor::ActorId,
};

use super::{
    columns::{EdgeSlot, NodeSlot, ScalarValue},
    order::{LocateLinkHydration, LocateNodeHydration},
    statements::{DetailColumns, TypeColumns, TypeUrlColumns, identity_filter},
    type_urls::TypeUrlResolver,
};
use crate::{
    bitset::DenseBitSlice, dataset::postgres::PostgresDatasetError, postgres::id::ArchivedEntityId,
};

/// The resolved actor one hydration masks properties for.
///
/// Property protection is a per-actor condition on the graph's read path, and a hydration
/// carries the actor identity the scope's policy resolution produced.
#[derive(Debug, Copy, Clone)]
pub(crate) struct MaskingActor {
    /// The actor the request's admitted scope names.
    pub id: ActorId,
    /// Whether the actor is an instance admin, whose reads bypass property protection.
    pub instance_admin: bool,
}

impl MaskingActor {
    /// Returns whether `config` masks this actor's reads.
    #[must_use]
    pub(crate) fn masked_by(self, config: &PropertyProtectionFilterConfig<'_>) -> bool {
        !config.is_empty() && !self.instance_admin
    }

    /// Returns the property protection over this actor's reads, absent when nothing masks.
    ///
    /// The self-access clause binds to this actor, who reads their own protected properties.
    #[must_use]
    pub(crate) fn protection<'config, 'rules>(
        self,
        config: &'config PropertyProtectionFilterConfig<'rules>,
    ) -> Option<PropertyProtectionFilter<'config, 'rules>> {
        self.masked_by(config)
            .then(|| config.to_property_protection_filter(Some(self.id)))
    }
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
    /// The dataset-layer read behind a delta display failed.
    Dataset(PostgresDatasetError),
}

impl From<PostgresDatasetError> for DetailError {
    fn from(value: PostgresDatasetError) -> Self {
        Self::Dataset(value)
    }
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
            Self::Dataset(error) => write!(fmt, "the link-display read failed: {error}"),
        }
    }
}

impl core::error::Error for DetailError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Query(error) => Some(error),
            Self::Dataset(error) => Some(error),
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
        let protection = masking.protection(&self.pool.settings.filter_protection);

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
        let protection = masking.protection(&self.pool.settings.filter_protection);
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
}

impl TypeUrlResolver for GraphDatabaseClient {
    /// Reads each requested type's versioned URL from the store's ontology records.
    ///
    /// The read carries no temporal condition. A type uuid derives from the URL it names, so any
    /// row that exists answers correctly whatever its archival state. A type deleted from the
    /// store is absent from the answer.
    ///
    /// # Panics
    ///
    /// This panics when a column does not decode at its assigned position or when a stored URL
    /// does not parse as its domain type.
    #[tracing::instrument(skip_all, fields(types))]
    async fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator> + Send,
    ) -> Result<Vec<(OntologyTypeUuid, VersionedUrl)>, DetailError> {
        let types = types.into_iter();
        tracing::Span::current().record("types", types.len());

        if types.is_empty() {
            return Ok(Vec::new());
        }

        let connection = self.connection().await?;
        let client = connection.as_client();

        let uuids: Vec<_> = types.map(EntityTypeUuid::from).collect();
        let filter = Filter::for_entity_type_uuids(&uuids);

        let mut compiler = SelectCompiler::new(None, false);
        compiler
            .add_filter(&filter)
            .expect("the type-uuid filter compiles against the entity-type query paths");

        let columns = TypeUrlColumns::select(&mut compiler);
        let (statement, parameters) = compiler.compile();

        let rows = client.query_raw(&statement, parameters).await?;

        let mut pairs = Vec::with_capacity(uuids.len());
        let mut rows = pin!(rows);
        while let Some(row) = rows.next().await {
            let row = row?;

            pairs.push(columns.pair(&row));
        }

        Ok(pairs)
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::filter::{
        Filter, FilterExpression, Parameter, protection::PropertyProtectionFilterConfig,
    };
    use type_system::{
        knowledge::Entity,
        principal::actor::{ActorId, UserId},
    };
    use uuid::Uuid;

    use super::MaskingActor;

    /// The masking actor over the user `actor` names.
    fn masking(actor: u128, instance_admin: bool) -> MaskingActor {
        MaskingActor {
            id: ActorId::User(UserId::new(Uuid::from_u128(actor))),
            instance_admin,
        }
    }

    /// Returns whether `filter` compares against the parameter `actor` anywhere in its tree.
    fn binds_actor(filter: &Filter<'_, Entity>, actor: Uuid) -> bool {
        let is_actor = |expression: &FilterExpression<'_, Entity>| {
            matches!(
                expression,
                FilterExpression::Parameter {
                    parameter: Parameter::Uuid(uuid),
                    ..
                } if *uuid == actor
            )
        };
        match filter {
            Filter::All(filters) | Filter::Any(filters) => {
                filters.iter().any(|filter| binds_actor(filter, actor))
            }
            Filter::Not(filter) => binds_actor(filter, actor),
            Filter::Equal(lhs, rhs) | Filter::NotEqual(lhs, rhs) => is_actor(lhs) || is_actor(rhs),
            Filter::Exists { .. }
            | Filter::Greater(..)
            | Filter::GreaterOrEqual(..)
            | Filter::Less(..)
            | Filter::LessOrEqual(..)
            | Filter::In(..)
            | Filter::StartsWith(..)
            | Filter::EndsWith(..)
            | Filter::ContainsSegment(..) => false,
        }
    }

    /// A deployment that protects no property masks nobody.
    #[test]
    fn protection_empty_config() {
        let config = PropertyProtectionFilterConfig::new();

        assert!(!masking(11, false).masked_by(&config));
        assert!(masking(11, false).protection(&config).is_none());
    }

    /// An instance admin reads unmasked under a protecting deployment.
    #[test]
    fn protection_instance_admin() {
        let config = PropertyProtectionFilterConfig::hash_default();

        assert!(!masking(11, true).masked_by(&config));
        assert!(masking(11, true).protection(&config).is_none());
    }

    /// A plain actor reads under the deployment's protection, with the self-access clause bound
    /// to that actor and to no other.
    #[test]
    fn protection_plain_actor() {
        let config = PropertyProtectionFilterConfig::hash_default();

        assert!(masking(11, false).masked_by(&config));
        let protection = masking(11, false)
            .protection(&config)
            .expect("a protecting deployment masks a plain actor");
        assert!(!protection.is_empty(), "the protection holds no rule");
        for (_property, filter) in protection.iter() {
            assert!(
                binds_actor(filter, Uuid::from_u128(11)),
                "the rule does not compare against the reading actor: {filter:?}"
            );
            assert!(
                !binds_actor(filter, Uuid::from_u128(12)),
                "the rule compares against another actor: {filter:?}"
            );
        }
    }
}
