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
    id::{Id as _, IdSlice, IdVec},
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
        LocateEntity, LocateLink, LocateNode, LocateProperties, LocateRequest, LocateResolver,
    },
    ontology::OntologyResolver,
    statements::{DetailColumns, TypeColumns, TypeUrlColumns, identity_filter},
    type_urls::TypeUrlResolver,
};
use crate::{
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
    nodes: &mut IdSlice<NodeSlot, LocateEntity<LocateNode>>,
    temporal_axes: &QueryTemporalAxes,
) -> Result<(), Report<HydrateError>> {
    let filter = identity_filter(nodes.iter().map(|node| EntityId::from(node.identity)));

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

    let lookup: FastHashMap<_, _> = nodes
        .iter_enumerated_mut()
        .map(|(slot, node)| {
            node.details = None;
            (node.identity, slot)
        })
        .collect();

    let mut rows = pin!(rows);
    while let Some(row) = rows.try_next().await.change_context(HydrateError::Query)? {
        let slot = lookup[&columns.entity_id(&row)];
        nodes[slot].details.get_or_insert_with(|| LocateNode {
            type_urls: columns.direct_type_urls(&row),
        });
    }

    Ok(())
}

async fn read_detail(
    client: &(impl GenericClient + Sync),
    source: ArchivedEntityId,
    protection: Option<&PropertyProtectionFilter<'_, '_>>,
    cap: usize,
    temporal_axes: &QueryTemporalAxes,
) -> Result<Option<LocateProperties>, Report<HydrateError>> {
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
        return Ok(None);
    };

    if stream
        .try_next()
        .await
        .change_context(HydrateError::Query)?
        .is_some()
    {
        return Err(Report::new(HydrateError::TooManyRows));
    }

    let (values, complete) = columns.capped_properties(&row, cap);
    Ok(Some(LocateProperties { values, complete }))
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

    /// Resolves node types and the source's actor-masked properties.
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
    #[tracing::instrument(skip_all, fields(points = nodes.len()))]
    async fn read_locate_nodes(
        &self,
        nodes: &mut IdSlice<NodeSlot, LocateEntity<LocateNode>>,
        properties: u32,
        masking: VisibilityActor,
    ) -> Result<Option<LocateProperties>, Report<HydrateError>> {
        if nodes.is_empty() {
            return Ok(None);
        }
        let source = nodes[NodeSlot::MIN].identity;

        let connection = self.connection().await?;
        let client = connection.as_client();

        let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
        let protection = masking.protection(&self.pool.settings.filter_protection);

        let ((), source_properties) = try_join!(
            read_types(client, nodes, &temporal_axes),
            read_detail(
                client,
                source,
                protection.as_ref(),
                properties as usize,
                &temporal_axes,
            ),
        )?;

        Ok(source_properties)
    }

    /// Resolves capped link types and actor-masked properties.
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
    #[tracing::instrument(skip_all, fields(edges = links.len()))]
    async fn read_locate_links(
        &self,
        links: &mut IdSlice<EdgeSlot, LocateEntity<LocateLink>>,
        type_ids: u32,
        properties: u32,
        masking: VisibilityActor,
    ) -> Result<(), Report<HydrateError>> {
        if links.is_empty() {
            return Ok(());
        }

        let connection = self.connection().await?;
        let client = connection.as_client();

        let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();

        let filter = identity_filter(links.iter().map(|link| EntityId::from(link.identity)));
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

        let lookup: FastHashMap<_, _> = links
            .iter_enumerated_mut()
            .map(|(slot, link)| {
                link.details = None;
                (link.identity, slot)
            })
            .collect();

        let mut rows = pin!(rows);
        while let Some(row) = rows.try_next().await.change_context(HydrateError::Query)? {
            let slot = lookup[&columns.entity_id(&row)];

            let mut type_urls = columns.direct_type_urls(&row);
            let type_urls_complete = type_urls.len() <= type_ids as usize;
            type_urls.truncate(type_ids as usize);

            let (values, complete) = columns.capped_properties(&row, properties as usize);
            links[slot].details = Some(LocateLink {
                type_urls,
                type_urls_complete,
                properties: LocateProperties { values, complete },
            });
        }

        Ok(())
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
    fn resolve(
        &self,
        LocateRequest {
            actor,
            nodes,
            links,
            properties,
            link_type_ids,
            link_properties,
        }: LocateRequest<'_>,
    ) -> Result<Option<LocateProperties>, Report<HydrateError>> {
        self.runtime.block_on(async {
            let (source_properties, ()) = try_join!(
                self.read_locate_nodes(nodes, properties, actor),
                self.read_locate_links(links, link_type_ids, link_properties, actor),
            )?;

            Ok(source_properties)
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
    use alloc::sync::Arc;

    use hash_graph_postgres_store::store::{
        DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
        PostgresStoreSettings,
    };
    use hash_graph_store::filter::{
        Filter, FilterExpression, Parameter, protection::PropertyProtectionFilterConfig,
    };
    use hashql_core::id::IdSlice;
    use tokio::runtime::Handle;
    use tokio_postgres::NoTls;
    use type_system::{
        knowledge::Entity,
        principal::actor::{ActorId, UserId},
    };
    use uuid::Uuid;

    use super::{GraphDatabaseClient, VisibilityActor};
    use crate::{
        math::nz,
        serve2::hydrate::{
            TypeUrlResolver,
            locate::{LocateRequest, LocateResolver},
            ontology::OntologyResolver,
        },
    };

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

    #[tokio::test]
    async fn blocking_worker_empty_requests() {
        let pool = Arc::new(
            PostgresStorePool::new(
                &DatabaseConnectionInfo::new(
                    DatabaseType::Postgres,
                    "hydrate-test".to_owned(),
                    String::new(),
                    "/no-hydrate-test-postgres".to_owned(),
                    5432,
                    "hydrate-test".to_owned(),
                ),
                &DatabasePoolConfig {
                    max_connections: nz!(1),
                },
                NoTls,
                PostgresStoreSettings::default(),
            )
            .await
            .expect("should construct an unconnected pool"),
        );
        let client = GraphDatabaseClient::new(pool, Handle::current());

        // The async runtime continues polling while its blocking worker drives synchronous reads.
        tokio::task::spawn_blocking(move || {
            let mut urls = TypeUrlResolver::resolve(&client, [])
                .expect("should resolve no URLs without a database connection")
                .into_iter();
            assert!(urls.next().is_none(), "should return no unrequested URLs");
            assert!(
                OntologyResolver::resolve(&client, IdSlice::from_raw(&[]))
                    .expect("should resolve no ontology rows without a connection")
                    .is_empty(),
                "should return no unrequested ontology rows"
            );
            let response = LocateResolver::resolve(
                &client,
                LocateRequest {
                    actor: masking(11, false),
                    nodes: IdSlice::from_raw_mut(&mut []),
                    links: IdSlice::from_raw_mut(&mut []),
                    properties: 10,
                    link_type_ids: 5,
                    link_properties: 10,
                },
            )
            .expect("should resolve an empty locate request without a connection");
            assert_eq!(response, None);
        })
        .await
        .expect("the blocking worker should finish without a nested-runtime panic");
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

    /// Property protection binds self-access to the reading actor.
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
