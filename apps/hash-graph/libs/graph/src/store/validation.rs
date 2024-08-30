use alloc::sync::Arc;
use core::{fmt::Debug, hash::Hash};
use std::collections::HashMap;

use authorization::{
    backend::PermissionAssertion,
    schema::{DataTypePermission, EntityPermission, EntityTypePermission, PropertyTypePermission},
    zanzibar::Consistency,
    AuthorizationApi,
};
use error_stack::{ensure, Report, ResultExt};
use futures::TryStreamExt;
use graph_types::{
    account::AccountId,
    knowledge::entity::{Entity, EntityId},
    ontology::{
        DataTypeId, DataTypeWithMetadata, EntityTypeId, EntityTypeWithMetadata, PropertyTypeId,
        PropertyTypeWithMetadata,
    },
};
use tokio::sync::RwLock;
use tokio_postgres::GenericClient;
use type_system::{
    schema::{ClosedEntityType, DataType, PropertyType},
    url::{BaseUrl, VersionedUrl},
};
use validation::{DataTypeProvider, EntityProvider, EntityTypeProvider, OntologyTypeProvider};

use crate::{
    store::{crud::Read, query::Filter, AsClient, PostgresStore, QueryError},
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};

#[derive(Debug, Clone)]
enum Access<T> {
    Granted(T),
    Denied,
    Malformed,
}

impl<T> Access<T> {
    fn map<U>(self, f: impl FnOnce(T) -> U) -> Access<U> {
        match self {
            Self::Granted(value) => Access::Granted(f(value)),
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
    data_types: CacheHashMap<DataTypeId, DataType>,
    property_types: CacheHashMap<PropertyTypeId, PropertyType>,
    entity_types: CacheHashMap<EntityTypeId, ClosedEntityType>,
    entities: CacheHashMap<EntityId, Entity>,
}

#[derive(Debug)]
pub struct StoreProvider<'a, S, A> {
    pub store: &'a S,
    pub cache: StoreCache,
    pub authorization: Option<(&'a A, AccountId, Consistency<'static>)>,
}

impl<S, A> StoreProvider<'_, S, A>
where
    S: Read<DataTypeWithMetadata>,
    A: AuthorizationApi,
{
    async fn authorize_data_type(&self, type_id: DataTypeId) -> Result<(), Report<QueryError>> {
        if let Some((authorization_api, actor_id, consistency)) = self.authorization {
            authorization_api
                .check_data_type_permission(
                    actor_id,
                    DataTypePermission::View,
                    type_id,
                    consistency,
                )
                .await
                .change_context(QueryError)?
                .assert_permission()
                .change_context(QueryError)?;
        }

        Ok(())
    }
}

impl<S, A> OntologyTypeProvider<DataType> for StoreProvider<'_, S, A>
where
    S: Read<DataTypeWithMetadata>,
    A: AuthorizationApi,
{
    #[expect(refining_impl_trait)]
    async fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> Result<Arc<DataType>, Report<QueryError>> {
        let data_type_id = DataTypeId::from_url(type_id);

        if let Some(cached) = self.cache.data_types.get(&data_type_id).await {
            return cached;
        }

        if let Err(error) = self.authorize_data_type(data_type_id).await {
            self.cache.data_types.deny(data_type_id).await;
            return Err(error);
        }

        let schema = self
            .store
            .read_one(
                &Filter::for_versioned_url(type_id),
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
            .map(|data_type| data_type.schema)?;

        let schema = self.cache.data_types.grant(data_type_id, schema).await;

        Ok(schema)
    }
}

impl<C, A> DataTypeProvider for StoreProvider<'_, PostgresStore<C, A>, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[expect(refining_impl_trait)]
    async fn is_parent_of(
        &self,
        child: &VersionedUrl,
        parent: &BaseUrl,
    ) -> Result<bool, Report<QueryError>> {
        let client = self.store.as_client().client();
        let child = DataTypeId::from_url(child);

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

    #[expect(refining_impl_trait)]
    async fn has_children(&self, data_type: DataTypeId) -> Result<bool, Report<QueryError>> {
        let client = self.store.as_client().client();

        Ok(client
            .query_one(
                "
                    SELECT EXISTS (
                        SELECT 1 FROM data_type_inherits_from
                        WHERE target_data_type_ontology_id = $1
                    );
                ",
                &[&data_type],
            )
            .await
            .change_context(QueryError)?
            .get(0))
    }
}

impl<S, A> StoreProvider<'_, S, A>
where
    S: Read<PropertyTypeWithMetadata>,
    A: AuthorizationApi,
{
    async fn authorize_property_type(
        &self,
        type_id: PropertyTypeId,
    ) -> Result<(), Report<QueryError>> {
        if let Some((authorization_api, actor_id, consistency)) = self.authorization {
            authorization_api
                .check_property_type_permission(
                    actor_id,
                    PropertyTypePermission::View,
                    type_id,
                    consistency,
                )
                .await
                .change_context(QueryError)?
                .assert_permission()
                .change_context(QueryError)?;
        }

        Ok(())
    }
}

impl<S, A> OntologyTypeProvider<PropertyType> for StoreProvider<'_, S, A>
where
    S: Read<PropertyTypeWithMetadata>,
    A: AuthorizationApi,
{
    #[expect(refining_impl_trait)]
    async fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> Result<Arc<PropertyType>, Report<QueryError>> {
        let property_type_id = PropertyTypeId::from_url(type_id);

        if let Some(cached) = self.cache.property_types.get(&property_type_id).await {
            return cached;
        }

        if let Err(error) = self.authorize_property_type(property_type_id).await {
            self.cache.property_types.deny(property_type_id).await;
            return Err(error);
        }

        let schema = self
            .store
            .read_one(
                &Filter::for_versioned_url(type_id),
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
            .map(|property_type| property_type.schema)?;

        let schema = self
            .cache
            .property_types
            .grant(property_type_id, schema)
            .await;

        Ok(schema)
    }
}

impl<C, A> StoreProvider<'_, PostgresStore<C, A>, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    async fn authorize_entity_type(&self, type_id: EntityTypeId) -> Result<(), Report<QueryError>> {
        if let Some((authorization_api, actor_id, consistency)) = self.authorization {
            authorization_api
                .check_entity_type_permission(
                    actor_id,
                    EntityTypePermission::View,
                    type_id,
                    consistency,
                )
                .await
                .change_context(QueryError)?
                .assert_permission()
                .change_context(QueryError)?;
        }

        Ok(())
    }

    async fn fetch_entity_type(
        &self,
        type_id: &VersionedUrl,
    ) -> Result<ClosedEntityType, Report<QueryError>> {
        let mut schemas = self
            .store
            .read_closed_schemas(
                &Filter::<EntityTypeWithMetadata>::for_versioned_url(type_id),
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

impl<C, A> OntologyTypeProvider<ClosedEntityType> for StoreProvider<'_, PostgresStore<C, A>, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[expect(refining_impl_trait)]
    async fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> Result<Arc<ClosedEntityType>, Report<QueryError>> {
        let entity_type_id = EntityTypeId::from_url(type_id);

        if let Some(cached) = self.cache.entity_types.get(&entity_type_id).await {
            return cached;
        }

        if let Err(error) = self.authorize_entity_type(entity_type_id).await {
            self.cache.entity_types.deny(entity_type_id).await;
            return Err(error);
        }

        let schema = match self.fetch_entity_type(type_id).await {
            Ok(schema) => schema,
            Err(error) => {
                self.cache.entity_types.malformed(entity_type_id).await;
                return Err(error);
            }
        };

        let schema = self.cache.entity_types.grant(entity_type_id, schema).await;
        Ok(schema)
    }
}

impl<C, A> EntityTypeProvider for StoreProvider<'_, PostgresStore<C, A>, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[expect(refining_impl_trait)]
    async fn is_parent_of(
        &self,
        child: &VersionedUrl,
        parent: &BaseUrl,
    ) -> Result<bool, Report<QueryError>> {
        let client = self.store.as_client().client();
        let child_id = EntityTypeId::from_url(child);

        Ok(client
            .query_one(
                "
                    SELECT EXISTS (
                        SELECT 1 FROM closed_entity_type_inherits_from
                         JOIN ontology_ids
                           ON ontology_ids.ontology_id = target_entity_type_ontology_id
                        WHERE source_entity_type_ontology_id = $1
                          AND ontology_ids.base_url = $2
                    );
                ",
                &[child_id.as_uuid(), &parent.as_str()],
            )
            .await
            .change_context(QueryError)?
            .get(0))
    }
}

impl<S, A> EntityProvider for StoreProvider<'_, S, A>
where
    S: Read<Entity>,
    A: AuthorizationApi,
{
    #[expect(refining_impl_trait)]
    async fn provide_entity(&self, entity_id: EntityId) -> Result<Arc<Entity>, Report<QueryError>> {
        if let Some(cached) = self.cache.entities.get(&entity_id).await {
            return cached;
        }
        if let Some((authorization_api, actor_id, consistency)) = self.authorization {
            authorization_api
                .check_entity_permission(actor_id, EntityPermission::View, entity_id, consistency)
                .await
                .change_context(QueryError)?
                .assert_permission()
                .change_context(QueryError)?;
        }

        let entity = self
            .store
            .read_one(
                &Filter::for_entity_by_entity_id(entity_id),
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
