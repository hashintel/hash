use alloc::sync::Arc;
use core::pin::pin;

use error_stack::{Report, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_postgres_store::store::{
    AsClient, PostgresStorePool, postgres::query::SelectCompiler,
};
use hash_graph_store::{
    filter::{Filter, protection::PropertyProtectionFilter},
    pool::StorePool as _,
    subgraph::temporal_axes::{QueryTemporalAxes, QueryTemporalAxesUnresolved},
};
use hashql_core::{
    collections::FastHashMap,
    id::{Id as _, IdSlice, IdVec, bit_vec::DenseBitSet},
};
use tokio::{runtime::Handle, try_join};
use tokio_postgres::GenericClient;
use type_system::{
    knowledge::entity::id::EntityId,
    ontology::{
        entity_type::EntityTypeUuid,
        id::{OntologyTypeUuid, VersionedUrl},
    },
};

use super::{
    columns::{EdgeSlot, NodeSlot, TypeSlot},
    locate::{
        LocateLinkResponse, LocateNodeResponse, LocateRequest, LocateResolver, LocateResponse,
    },
    ontology::OntologyResolver,
    scalar::ScalarProperties,
    statements::{DetailColumns, TypeColumns, TypeUrlColumns, identity_filter},
    type_urls::TypeUrlResolver,
};
use crate::{
    bitset::DenseBitSlice,
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    serve2::visibility::VisibilityActor,
};

/// A detail hydration failed against the store.
#[derive(Debug)]
pub(crate) enum HydrateError {
    /// No connection was available for the query.
    Connect,
    /// The store rejected the query.
    Query,
    /// The query returned too many rows.
    TooManyRows,
}

impl core::fmt::Display for HydrateError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Connect => {
                write!(fmt, "the detail hydration reached no store connection")
            }
            Self::Query => write!(fmt, "the detail hydration failed"),
            Self::TooManyRows => fmt.write_str("the detail hydration returned too many rows"),
        }
    }
}

impl core::error::Error for HydrateError {}

async fn read_types(
    client: &impl GenericClient,
    ids: &IdSlice<NodeSlot, ArchivedEntityId>,
    temporal_axes: &QueryTemporalAxes,
) -> Result<(DenseBitSet<NodeSlot>, IdVec<NodeSlot, Vec<VersionedUrl>>), Report<HydrateError>> {
    let filter = identity_filter(ids.iter().copied().map(EntityId::from));

    let mut compiler = SelectCompiler::new(Some(temporal_axes), false);
    compiler
        .add_filter(&filter)
        .expect("the identity filter compiles against the entity query paths");

    let columns = TypeColumns::select(&mut compiler);
    let (statement, parameters) = compiler.compile();

    let rows = client
        .query_raw(&statement, parameters)
        .await
        .change_context(HydrateError::Query)?;

    let lookup: FastHashMap<_, _> = ids
        .iter_enumerated()
        .map(|(slot, &id)| (id, slot))
        .collect();

    let mut resolved = DenseBitSet::new_empty(ids.len());
    let mut type_urls: IdVec<_, _> = IdVec::from_elem(Vec::new(), ids.len());

    let mut rows = pin!(rows);
    while let Some(row) = rows.try_next().await.change_context(HydrateError::Query)? {
        let slot = lookup[&columns.entity_id(&row)];

        if resolved.insert(slot) {
            type_urls[slot].extend(columns.direct_type_urls(&row));
        }
    }

    Ok((resolved, type_urls))
}

async fn read_detail(
    client: &(impl GenericClient + Sync),
    source: ArchivedEntityId,
    protection: Option<&PropertyProtectionFilter<'_, '_>>,
    cap: usize,
    temporal_axes: &QueryTemporalAxes,
) -> Result<(Option<ScalarProperties>, bool), Report<HydrateError>> {
    let filter = identity_filter([source.into()]);

    let mut compiler = SelectCompiler::new(Some(temporal_axes), false);
    compiler
        .add_filter(&filter)
        .expect("the identity filter compiles against the entity query paths");

    let columns = DetailColumns::select(&mut compiler, protection);
    let (statement, parameters) = compiler.compile();

    let stream = client
        .query_raw(&statement, parameters)
        .await
        .change_context(HydrateError::Query)?;

    let mut stream = pin!(stream);
    let Some(row) = stream
        .try_next()
        .await
        .change_context(HydrateError::Query)?
    else {
        return Ok((None, false));
    };

    if stream
        .try_next()
        .await
        .change_context(HydrateError::Query)?
        .is_some()
    {
        return Err(Report::new(HydrateError::TooManyRows));
    }

    let (properties, complete) = columns.capped_properties(&row, cap);
    Ok((Some(properties), complete))
}

/// Live detail reads over the serving store pool.
///
/// The pool's settings determine property protection. Call the resolvers from a blocking worker
/// while the supplied runtime drives I/O.
#[derive(Debug)]
pub(crate) struct GraphDatabaseClient {
    pool: Arc<PostgresStorePool>,
    runtime: Handle,
}

impl GraphDatabaseClient {
    #[must_use]
    pub(crate) const fn new(pool: Arc<PostgresStorePool>, runtime: Handle) -> Self {
        Self { pool, runtime }
    }

    /// Holds one connection for the duration of one hydration.
    async fn connection(&self) -> Result<impl AsClient, Report<HydrateError>> {
        self.pool
            .acquire(None)
            .await
            .change_context(HydrateError::Connect)
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
    /// Returns [`HydrateError`] when the store rejects a query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain, when a column does
    /// not decode at its assigned position, or when a stored URL does not parse as its domain
    /// type.
    #[tracing::instrument(skip_all, fields(points = ids.len()))]
    async fn read_locate_nodes(
        &self,
        ids: &IdSlice<NodeSlot, ArchivedEntityId>,
        properties: u32,
        masking: VisibilityActor,
    ) -> Result<LocateNodeResponse, Report<HydrateError>> {
        if ids.is_empty() {
            return Ok(LocateNodeResponse::empty(0));
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

        Ok(LocateNodeResponse {
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
    /// Returns [`HydrateError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// This panics when the store answers rows outside the request domain, when a column does
    /// not decode at its assigned position, or when a stored URL does not parse as its domain
    /// type.
    #[tracing::instrument(skip_all, fields(edges = ids.len()))]
    async fn read_locate_links(
        &self,
        ids: &IdSlice<EdgeSlot, ArchivedEntityId>,
        type_ids: u32,
        properties: u32,
        masking: VisibilityActor,
    ) -> Result<LocateLinkResponse, Report<HydrateError>> {
        if ids.is_empty() {
            return Ok(LocateLinkResponse::empty(0));
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

        let rows = client
            .query_raw(&statement, parameters)
            .await
            .change_context(HydrateError::Query)?;

        let lookup: FastHashMap<_, _> = ids
            .iter_enumerated()
            .map(|(slot, &id)| (id, slot))
            .collect();

        let mut type_url_columns: IdVec<_, _> = IdVec::from_elem(Vec::new(), ids.len());
        let mut type_urls_complete = DenseBitSlice::new_empty(ids.len());

        let mut properties_columns: IdVec<_, _> = IdVec::from_elem(None, ids.len());
        let mut properties_complete = DenseBitSlice::new_empty(ids.len());

        let mut rows = pin!(rows);
        while let Some(row) = rows.try_next().await.change_context(HydrateError::Query)? {
            let slot = lookup[&columns.entity_id(&row)];

            let mut type_urls = columns.direct_type_urls(&row);
            type_urls_complete.set(slot, type_urls.len() <= (type_ids as usize));

            type_urls.truncate(type_ids as usize);
            type_url_columns[slot].extend(type_urls);

            let (survivors, complete) = columns.capped_properties(&row, properties as usize);

            properties_columns.insert(slot, survivors);
            properties_complete.set(slot, complete);
        }

        Ok(LocateLinkResponse {
            type_urls: type_url_columns,
            type_urls_complete,
            properties: properties_columns,
            properties_complete,
        })
    }

    #[tracing::instrument(skip_all, fields(types))]
    async fn read_type_urls(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
    ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>
    {
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

        let rows = client
            .query_raw(&statement, parameters)
            .await
            .change_context(HydrateError::Query)?;

        let mut pairs = Vec::with_capacity(uuids.len());
        let mut rows = pin!(rows);
        while let Some(row) = rows.try_next().await.change_context(HydrateError::Query)? {
            pairs.push(columns.pair(&row));
        }

        Ok(pairs)
    }
}

impl TypeUrlResolver for GraphDatabaseClient {
    fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
    ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>
    {
        self.runtime.block_on(self.read_type_urls(types))
    }
}

impl LocateResolver for GraphDatabaseClient {
    fn resolve(&self, request: LocateRequest<'_>) -> Result<LocateResponse, Report<HydrateError>> {
        let nodes: IdVec<NodeSlot, ArchivedEntityId> = request.nodes.iter().collect();

        self.runtime.block_on(async {
            let (nodes, links) = try_join!(
                self.read_locate_nodes(&nodes, request.properties, request.actor),
                self.read_locate_links(
                    request.links,
                    request.link_type_ids,
                    request.link_properties,
                    request.actor,
                ),
            )?;

            Ok(LocateResponse { nodes, links })
        })
    }
}

impl OntologyResolver for GraphDatabaseClient {
    fn resolve(
        &self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, Report<HydrateError>> {
        let uuids = ArchivedOntologyTypeUuid::into_slice(types.as_raw());

        let resolved: FastHashMap<_, _> = TypeUrlResolver::resolve(self, uuids.iter().copied())?
            .into_iter()
            .collect();

        Ok(uuids
            .iter()
            .map(|uuid| resolved.get(uuid).cloned())
            .collect())
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

    use super::VisibilityActor;

    /// The masking actor over the user `actor` names.
    fn masking(actor: u128, instance_admin: bool) -> VisibilityActor {
        VisibilityActor {
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
