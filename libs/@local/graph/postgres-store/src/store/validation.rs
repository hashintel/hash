use alloc::sync::Arc;
use core::{borrow::Borrow, fmt::Debug, hash::Hash};
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _, ensure};
use futures::TryStreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    backend::PermissionAssertion,
    policies::{PolicyComponents, action::ActionName},
    schema::DataTypePermission,
    zanzibar::Consistency,
};
use hash_graph_store::{
    error::QueryError,
    filter::Filter,
    query::Read as _,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use hash_graph_types::ontology::{DataTypeLookup, OntologyTypeProvider};
use hash_graph_validation::EntityProvider;
use tokio::sync::RwLock;
use tokio_postgres::GenericClient as _;
use type_system::{
    Valid,
    knowledge::{Entity, entity::EntityId},
    ontology::{
        BaseUrl, DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata,
        VersionedUrl,
        data_type::{
            ClosedDataType, ConversionDefinition, ConversionExpression, DataTypeUuid,
            schema::DataTypeReference,
        },
        entity_type::{ClosedEntityType, ClosedEntityTypeWithMetadata, EntityTypeUuid},
        property_type::{PropertyType, PropertyTypeUuid},
    },
    principal::actor::ActorEntityUuid,
};

use crate::store::postgres::{AsClient, PostgresStore};

#[derive(Debug, Clone)]
enum Access<T> {
    Granted(T),
    Denied,
    Malformed,
}

impl<T> Access<T> {
    fn map<U>(self, func: impl FnOnce(T) -> U) -> Access<U> {
        match self {
            Self::Granted(value) => Access::Granted(func(value)),
            Self::Denied => Access::Denied,
            Self::Malformed => Access::Malformed,
        }
    }

    const fn as_ref(&self) -> Access<&T> {
        match self {
            Self::Granted(value) => Access::Granted(value),
            Self::Denied => Access::Denied,
            Self::Malformed => Access::Malformed,
        }
    }
}

// TODO: potentially add a cache eviction policy
#[derive(Debug)]
struct CacheHashMap<K, V> {
    inner: RwLock<HashMap<K, Access<Arc<V>>>>,
}

impl<K, V> Default for CacheHashMap<K, V> {
    fn default() -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
        }
    }
}
impl<K, V> CacheHashMap<K, V>
where
    K: Debug + Eq + Hash + Send + Sync,
    V: Send + Sync,
{
    async fn get(&self, key: &K) -> Option<Result<Arc<V>, Report<QueryError>>> {
        let guard = self.inner.read().await;
        let access = guard.get(key)?.as_ref().map(Arc::clone);
        drop(guard);

        match access {
            Access::Granted(value) => Some(Ok(value)),
            Access::Denied => Some(Err(
                Report::new(PermissionAssertion).change_context(QueryError)
            )),
            Access::Malformed => Some(Err(Report::new(QueryError).attach_printable(format!(
                "The entry in the cache for key {key:?} is malformed. This means that a previous \
                 fetch involving this key failed."
            )))),
        }
    }

    async fn grant(&self, key: K, value: V) -> Arc<V> {
        let value = Arc::new(value);
        self.inner
            .write()
            .await
            .insert(key, Access::Granted(Arc::clone(&value)));

        value
    }

    async fn deny(&self, key: K) {
        self.inner.write().await.insert(key, Access::Denied);
    }

    async fn malformed(&self, key: K) {
        self.inner.write().await.insert(key, Access::Malformed);
    }
}

#[derive(Debug, Default)]
pub struct StoreCache {
    data_types_with_metadata: CacheHashMap<DataTypeUuid, DataTypeWithMetadata>,
    closed_data_types: CacheHashMap<DataTypeUuid, ClosedDataType>,
    property_types: CacheHashMap<PropertyTypeUuid, PropertyType>,
    closed_entity_types_with_metadata: CacheHashMap<EntityTypeUuid, ClosedEntityTypeWithMetadata>,
    closed_entity_types: CacheHashMap<EntityTypeUuid, ClosedEntityType>,
    entities: CacheHashMap<EntityId, Entity>,
    conversions: CacheHashMap<(DataTypeUuid, DataTypeUuid), Vec<ConversionExpression>>,
}

#[derive(Debug)]
pub struct StoreProvider<'a, S> {
    pub store: &'a S,
    pub cache: Box<StoreCache>,
    pub policy_components: Option<&'a PolicyComponents>,
}

impl<'a, S> StoreProvider<'a, S> {
    pub fn new(store: &'a S, policy_components: &'a PolicyComponents) -> Self {
        Self {
            store,
            cache: Box::new(StoreCache::default()),
            policy_components: Some(policy_components),
        }
    }
}

impl<C, A> StoreProvider<'_, PostgresStore<C, A>>
where
    C: AsClient,
    A: AuthorizationApi,
{
    async fn authorize_data_type(&self, type_id: DataTypeUuid) -> Result<(), Report<QueryError>> {
        if let Some(policy_components) = &self.policy_components {
            self.store
                .authorization_api
                .check_data_type_permission(
                    policy_components
                        .actor_id()
                        .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from),
                    DataTypePermission::View,
                    type_id,
                    Consistency::FullyConsistent,
                )
                .await
                .change_context(QueryError)?
                .assert_permission()
                .change_context(QueryError)?;
        }

        Ok(())
    }
}

impl<C, A> DataTypeLookup for StoreProvider<'_, PostgresStore<C, A>>
where
    C: AsClient,
    A: AuthorizationApi,
{
    type ClosedDataType = Arc<ClosedDataType>;
    type DataTypeWithMetadata = Arc<DataTypeWithMetadata>;
    type Error = QueryError;

    async fn lookup_data_type_by_uuid(
        &self,
        data_type_uuid: DataTypeUuid,
    ) -> Result<Arc<DataTypeWithMetadata>, Report<QueryError>> {
        if let Some(cached) = self
            .cache
            .data_types_with_metadata
            .get(&data_type_uuid)
            .await
        {
            return cached;
        }

        if let Err(error) = self.authorize_data_type(data_type_uuid).await {
            self.cache
                .data_types_with_metadata
                .deny(data_type_uuid)
                .await;
            return Err(error);
        }

        let schema = self
            .store
            .read_one(
                &[Filter::for_data_type_uuid(data_type_uuid)],
                Some(
                    &QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    }
                    .resolve(),
                ),
                false,
            )
            .await?;

        let schema = self
            .cache
            .data_types_with_metadata
            .grant(data_type_uuid, schema)
            .await;

        Ok(schema)
    }

    async fn lookup_closed_data_type_by_uuid(
        &self,
        data_type_uuid: DataTypeUuid,
    ) -> Result<Arc<ClosedDataType>, Report<QueryError>> {
        if let Some(cached) = self.cache.closed_data_types.get(&data_type_uuid).await {
            return cached;
        }

        if let Err(error) = self.authorize_data_type(data_type_uuid).await {
            self.cache.closed_data_types.deny(data_type_uuid).await;
            return Err(error);
        }

        let schema: Valid<ClosedDataType> = self
            .store
            .as_client()
            .query_one(
                "SELECT closed_schema FROM data_types WHERE ontology_id = $1",
                &[&data_type_uuid],
            )
            .await
            .change_context(QueryError)?
            .get(0);

        let schema = self
            .cache
            .closed_data_types
            .grant(data_type_uuid, schema.into_inner())
            .await;

        Ok(schema)
    }

    async fn is_parent_of(
        &self,
        child: &DataTypeReference,
        parent: &BaseUrl,
    ) -> Result<bool, Report<QueryError>> {
        let client = self.store.as_client().client();
        let child = DataTypeUuid::from_url(&child.url);

        Ok(client
            .query_one(
                "
                    SELECT EXISTS (
                        SELECT 1 FROM data_type_inherits_from
                         JOIN ontology_ids
                           ON ontology_ids.ontology_id = target_data_type_ontology_id
                        WHERE source_data_type_ontology_id = $1
                          AND ontology_ids.base_url = $2
                    );
                ",
                &[&child, &parent],
            )
            .await
            .change_context(QueryError)?
            .get(0))
    }

    async fn find_conversion(
        &self,
        source: &DataTypeReference,
        target: &DataTypeReference,
    ) -> Result<impl Borrow<Vec<ConversionExpression>>, Report<QueryError>> {
        let source_uuid = DataTypeUuid::from_url(&source.url);
        let target_uuid = DataTypeUuid::from_url(&target.url);

        if let Some(cached) = self
            .cache
            .conversions
            .get(&(source_uuid, target_uuid))
            .await
        {
            return cached;
        }

        let expression = self
            .store
            .as_client()
            .client()
            .query_one(
                "
                    SELECT array[source.into, target.from]
                      FROM data_type_conversions AS source
                      JOIN data_type_conversions AS target
                        ON source.target_data_type_base_url = target.target_data_type_base_url
                     WHERE source.source_data_type_ontology_id = $1
                       AND target.source_data_type_ontology_id = $2
	            UNION
	                SELECT array[data_type_conversions.into]
                      FROM data_type_conversions
                     WHERE source_data_type_ontology_id = $1
                       AND target_data_type_base_url = $4
	            UNION
	                SELECT array[data_type_conversions.from]
                      FROM data_type_conversions
                     WHERE source_data_type_ontology_id = $2
                       AND target_data_type_base_url = $3
                ;",
                &[
                    &source_uuid,
                    &target_uuid,
                    &source.url.base_url,
                    &target.url.base_url,
                ],
            )
            .await
            .change_context(QueryError)
            .attach_printable_lazy(|| {
                format!(
                    "Found none or more than one conversions between `{}` and `{}`",
                    source.url, target.url
                )
            })?
            .get::<_, Vec<ConversionDefinition>>(0)
            .into_iter()
            .map(|conversion| conversion.expression)
            .collect();

        Ok(self
            .cache
            .conversions
            .grant((source_uuid, target_uuid), expression)
            .await)
    }
}

impl<C, A> StoreProvider<'_, PostgresStore<C, A>>
where
    C: AsClient,
    A: AuthorizationApi,
{
    async fn fetch_property_type(
        &self,
        type_id: &VersionedUrl,
        policy_components: Option<&PolicyComponents>,
    ) -> Result<PropertyTypeWithMetadata, Report<QueryError>> {
        let mut filters = vec![Filter::<PropertyTypeWithMetadata>::for_versioned_url(
            type_id,
        )];

        if let Some(policy_components) = policy_components {
            filters.push(Filter::<PropertyTypeWithMetadata>::for_policies(
                policy_components.extract_filter_policies(ActionName::ViewPropertyType),
                policy_components.optimization_data(ActionName::ViewPropertyType),
            ));
        }

        let mut schemas = self
            .store
            .read(
                &filters,
                Some(
                    &QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    }
                    .resolve(),
                ),
                false,
            )
            .await
            .change_context(QueryError)?
            .try_collect::<Vec<_>>()
            .await
            .change_context(QueryError)?;

        ensure!(
            schemas.len() <= 1,
            Report::new(QueryError).attach_printable(format!(
                "Expected exactly one property type to be returned from the query but {} were \
                 returned",
                schemas.len(),
            ))
        );

        schemas.pop().ok_or_else(|| {
            Report::new(QueryError).attach_printable(
                "Expected exactly one property type to be returned from the query but none were \
                 returned",
            )
        })
    }
}

impl<C, A> OntologyTypeProvider<PropertyType> for StoreProvider<'_, PostgresStore<C, A>>
where
    C: AsClient,
    A: AuthorizationApi,
{
    type Value = Arc<PropertyType>;

    #[expect(refining_impl_trait)]
    async fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> Result<Arc<PropertyType>, Report<QueryError>> {
        let property_type_id = PropertyTypeUuid::from_url(type_id);

        if let Some(cached) = self.cache.property_types.get(&property_type_id).await {
            return cached;
        }

        let schema = match self
            .fetch_property_type(type_id, self.policy_components)
            .await
        {
            Ok(property_type) => property_type.schema,
            Err(error) => {
                self.cache.property_types.malformed(property_type_id).await;
                return Err(error);
            }
        };

        let schema = self
            .cache
            .property_types
            .grant(property_type_id, schema)
            .await;

        Ok(schema)
    }
}

impl<C, A> StoreProvider<'_, PostgresStore<C, A>>
where
    C: AsClient,
    A: AuthorizationApi,
{
    async fn fetch_entity_type(
        &self,
        type_id: &VersionedUrl,
        policy_components: Option<&PolicyComponents>,
    ) -> Result<ClosedEntityTypeWithMetadata, Report<QueryError>> {
        let mut filters = vec![Filter::<EntityTypeWithMetadata>::for_versioned_url(type_id)];

        if let Some(policy_components) = policy_components {
            filters.push(Filter::<EntityTypeWithMetadata>::for_policies(
                policy_components.extract_filter_policies(ActionName::ViewEntityType),
                policy_components.optimization_data(ActionName::ViewEntityType),
            ));
        }

        let mut schemas = self
            .store
            .read_closed_schemas(
                &filters,
                Some(
                    &QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    }
                    .resolve(),
                ),
            )
            .await
            .change_context(QueryError)?
            .map_ok(|(_, entity_type)| entity_type)
            .try_collect::<Vec<_>>()
            .await
            .change_context(QueryError)?;

        ensure!(
            schemas.len() <= 1,
            Report::new(QueryError).attach_printable(format!(
                "Expected exactly one closed schema to be returned from the query but {} were \
                 returned",
                schemas.len(),
            ))
        );

        schemas.pop().ok_or_else(|| {
            Report::new(QueryError).attach_printable(
                "Expected exactly one closed schema to be returned from the query but none was \
                 returned",
            )
        })
    }
}

impl<C, A> OntologyTypeProvider<ClosedEntityTypeWithMetadata>
    for StoreProvider<'_, PostgresStore<C, A>>
where
    C: AsClient,
    A: AuthorizationApi,
{
    type Value = Arc<ClosedEntityTypeWithMetadata>;

    #[expect(refining_impl_trait)]
    async fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> Result<Arc<ClosedEntityTypeWithMetadata>, Report<QueryError>> {
        let entity_type_id = EntityTypeUuid::from_url(type_id);

        if let Some(cached) = self
            .cache
            .closed_entity_types_with_metadata
            .get(&entity_type_id)
            .await
        {
            return cached;
        }

        let schema = match self
            .fetch_entity_type(type_id, self.policy_components)
            .await
        {
            Ok(schema) => schema,
            Err(error) => {
                self.cache
                    .closed_entity_types_with_metadata
                    .malformed(entity_type_id)
                    .await;
                return Err(error);
            }
        };

        let schema = self
            .cache
            .closed_entity_types_with_metadata
            .grant(entity_type_id, schema)
            .await;
        Ok(schema)
    }
}

impl<C, A> OntologyTypeProvider<ClosedEntityType> for StoreProvider<'_, PostgresStore<C, A>>
where
    C: AsClient,
    A: AuthorizationApi,
{
    type Value = Arc<ClosedEntityType>;

    #[expect(refining_impl_trait)]
    async fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> Result<Arc<ClosedEntityType>, Report<QueryError>> {
        let entity_type_id = EntityTypeUuid::from_url(type_id);

        if let Some(cached) = self.cache.closed_entity_types.get(&entity_type_id).await {
            return cached;
        }

        let schema = <Self as OntologyTypeProvider<ClosedEntityTypeWithMetadata>>::provide_type(
            self, type_id,
        )
        .await?
        .schema
        .clone();

        let schema = self
            .cache
            .closed_entity_types
            .grant(entity_type_id, schema)
            .await;
        Ok(schema)
    }
}

impl<C, A> EntityProvider for StoreProvider<'_, PostgresStore<C, A>>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[expect(refining_impl_trait)]
    async fn provide_entity(&self, entity_id: EntityId) -> Result<Arc<Entity>, Report<QueryError>> {
        if let Some(cached) = self.cache.entities.get(&entity_id).await {
            return cached;
        }

        let mut filters = vec![Filter::for_entity_by_entity_id(entity_id)];

        if let Some(policy_components) = &self.policy_components {
            let filter = Filter::<Entity>::for_policies(
                policy_components.extract_filter_policies(ActionName::ViewEntity),
                policy_components.actor_id(),
                policy_components.optimization_data(ActionName::ViewEntity),
            );
            filters.push(filter);
        }

        let entity = self
            .store
            .read_one(
                &filters,
                Some(
                    &QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    }
                    .resolve(),
                ),
                entity_id.draft_id.is_some(),
            )
            .await?;
        Ok(self.cache.entities.grant(entity_id, entity).await)
    }
}
