use authorization::{
    schema::{
        DataTypeId, DataTypePermission, EntityPermission, EntityTypeId, EntityTypePermission,
        PropertyTypeId, PropertyTypePermission,
    },
    zanzibar::Consistency,
    AuthorizationApi,
};
use error_stack::{ensure, Report, ResultExt};
use futures::TryStreamExt;
use graph_types::{
    account::AccountId,
    knowledge::entity::{Entity, EntityId},
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};
use tokio_postgres::GenericClient;
use type_system::{url::VersionedUrl, DataType, EntityType, PropertyType};
use validation::{EntityProvider, EntityTypeProvider, OntologyTypeProvider};

use crate::{
    store::{crud::Read, query::Filter, AsClient, PostgresStore, QueryError},
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};

#[derive(Debug, Copy, Clone)]
pub struct StoreProvider<'a, S, A> {
    pub store: &'a S,
    pub authorization: Option<(&'a A, AccountId, Consistency<'static>)>,
}

impl<S, A> OntologyTypeProvider<DataType> for StoreProvider<'_, S, A>
where
    S: Read<DataTypeWithMetadata, Record = DataTypeWithMetadata>,
    A: AuthorizationApi + Sync,
{
    #[expect(refining_impl_trait)]
    async fn provide_type(&self, type_id: &VersionedUrl) -> Result<DataType, Report<QueryError>> {
        let data_type_id = DataTypeId::from_url(type_id);
        if let Some((authorization_api, actor_id, consistency)) = self.authorization {
            authorization_api
                .check_data_type_permission(
                    actor_id,
                    DataTypePermission::View,
                    data_type_id,
                    consistency,
                )
                .await
                .change_context(QueryError)?
                .assert_permission()
                .change_context(QueryError)?;
        }

        self.store
            .read_one(
                &Filter::<S::Record>::for_versioned_url(type_id),
                Some(&QueryTemporalAxesUnresolved::default().resolve()),
            )
            .await
            .map(|data_type| data_type.schema)
    }
}

impl<S, A> OntologyTypeProvider<PropertyType> for StoreProvider<'_, S, A>
where
    S: Read<PropertyTypeWithMetadata, Record = PropertyTypeWithMetadata>,
    A: AuthorizationApi + Sync,
{
    #[expect(refining_impl_trait)]
    async fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> Result<PropertyType, Report<QueryError>> {
        let data_type_id = PropertyTypeId::from_url(type_id);
        if let Some((authorization_api, actor_id, consistency)) = self.authorization {
            authorization_api
                .check_property_type_permission(
                    actor_id,
                    PropertyTypePermission::View,
                    data_type_id,
                    consistency,
                )
                .await
                .change_context(QueryError)?
                .assert_permission()
                .change_context(QueryError)?;
        }

        self.store
            .read_one(
                &Filter::<S::Record>::for_versioned_url(type_id),
                Some(&QueryTemporalAxesUnresolved::default().resolve()),
            )
            .await
            .map(|data_type| data_type.schema)
    }
}

impl<C, A> OntologyTypeProvider<EntityType> for StoreProvider<'_, PostgresStore<C>, A>
where
    C: AsClient,
    A: AuthorizationApi + Sync,
{
    #[expect(refining_impl_trait)]
    async fn provide_type(&self, type_id: &VersionedUrl) -> Result<EntityType, Report<QueryError>> {
        let entity_type_id = EntityTypeId::from_url(type_id);
        if let Some((authorization_api, actor_id, consistency)) = self.authorization {
            authorization_api
                .check_entity_type_permission(
                    actor_id,
                    EntityTypePermission::View,
                    entity_type_id,
                    consistency,
                )
                .await
                .change_context(QueryError)?
                .assert_permission()
                .change_context(QueryError)?;
        }

        let mut schemas = self
            .store
            .read_closed_schemas(
                &Filter::<EntityTypeWithMetadata>::for_versioned_url(type_id),
                Some(&QueryTemporalAxesUnresolved::default().resolve()),
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
        let schema = schemas.pop().ok_or_else(|| {
            Report::new(QueryError).attach_printable(
                "Expected exactly one closed schema to be returned from the query but none was \
                 returned",
            )
        })?;
        // TODO: Distinguish between format validation and content validation so it's possible
        //       to directly use the correct type.
        //   see https://linear.app/hash/issue/BP-33
        EntityType::try_from(schema).change_context(QueryError)
    }
}

impl<C, A> EntityTypeProvider for StoreProvider<'_, PostgresStore<C>, A>
where
    C: AsClient,
    A: AuthorizationApi + Sync,
{
    #[expect(refining_impl_trait)]
    async fn is_parent_of(
        &self,
        child: &VersionedUrl,
        parent: &VersionedUrl,
    ) -> Result<bool, Report<QueryError>> {
        let client = self.store.as_client().client();
        let child_id = EntityTypeId::from_url(child);
        let parent_id = EntityTypeId::from_url(parent);

        Ok(client
            .query_one(
                "
                    SELECT EXISTS (
                        SELECT 1 FROM closed_entity_type_inherits_from
                        WHERE source_entity_type_ontology_id = $1
                          AND target_entity_type_ontology_id = $2
                    );
                ",
                &[child_id.as_uuid(), parent_id.as_uuid()],
            )
            .await
            .change_context(QueryError)?
            .get(0))
    }
}

impl<S, A> EntityProvider for StoreProvider<'_, S, A>
where
    S: Read<Entity, Record = Entity>,
    A: AuthorizationApi + Sync,
{
    #[expect(refining_impl_trait)]
    async fn provide_entity(&self, entity_id: EntityId) -> Result<Entity, Report<QueryError>> {
        if let Some((authorization_api, actor_id, consistency)) = self.authorization {
            authorization_api
                .check_entity_permission(actor_id, EntityPermission::View, entity_id, consistency)
                .await
                .change_context(QueryError)?
                .assert_permission()
                .change_context(QueryError)?;
        }

        self.store
            .read_one(
                &Filter::<S::Record>::for_entity_by_entity_id(entity_id),
                Some(
                    &QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    }
                    .resolve(),
                ),
            )
            .await
    }
}
