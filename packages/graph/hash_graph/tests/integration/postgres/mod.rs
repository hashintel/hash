mod data_type;
mod entity;
mod entity_type;
mod links;
mod property_type;

use std::{borrow::Cow, str::FromStr};

use error_stack::Result;
use graph::{
    identifier::knowledge::EntityId,
    knowledge::{
        Entity, EntityMetadata, EntityProperties, EntityQueryPath, EntityUuid, LinkEntityMetadata,
    },
    ontology::{
        DataTypeWithMetadata, EntityTypeQueryPath, EntityTypeWithMetadata, OntologyElementMetadata,
        PropertyTypeWithMetadata,
    },
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::{
        identifier::{account::AccountId, GraphElementId},
        subgraph::{depths::GraphResolveDepths, query::StructuralQuery, vertices::Vertex},
    },
    store::{
        error::ArchivalError,
        query::{Filter, FilterExpression, Parameter},
        AccountStore, AsClient, DataTypeStore, DatabaseConnectionInfo, DatabaseType, EntityStore,
        EntityTypeStore, InsertionError, PostgresStore, PostgresStorePool, PropertyTypeStore,
        QueryError, StorePool, UpdateError,
    },
};
use tokio_postgres::{NoTls, Transaction};
use type_system::{uri::VersionedUri, DataType, EntityType, PropertyType};
use uuid::Uuid;

pub struct DatabaseTestWrapper {
    _pool: PostgresStorePool<NoTls>,
    connection: <PostgresStorePool<NoTls> as StorePool>::Store<'static>,
}

pub struct DatabaseApi<'pool> {
    store: PostgresStore<Transaction<'pool>>,
    account_id: AccountId,
}

impl DatabaseTestWrapper {
    pub async fn new() -> Self {
        const USER: &str = "graph";
        const PASSWORD: &str = "graph";
        const HOST: &str = "localhost";
        const PORT: u16 = 5432;
        const DATABASE: &str = "graph";

        let connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            USER.to_owned(),
            PASSWORD.to_owned(),
            HOST.to_owned(),
            PORT,
            DATABASE.to_owned(),
        );

        let pool = PostgresStorePool::new(&connection_info, NoTls)
            .await
            .expect("could not connect to database");

        let connection = pool
            .acquire_owned()
            .await
            .expect("could not acquire a database connection");

        Self {
            _pool: pool,
            connection,
        }
    }

    pub async fn seed<D, P, E>(
        &mut self,
        data_types: D,
        property_types: P,
        entity_types: E,
    ) -> Result<DatabaseApi<'_>, InsertionError>
    where
        D: IntoIterator<Item = &'static str>,
        P: IntoIterator<Item = &'static str>,
        E: IntoIterator<Item = &'static str>,
    {
        let mut store = PostgresStore::new(
            self.connection
                .as_mut_client()
                .transaction()
                .await
                .expect("could not start test transaction"),
        );

        let account_id = AccountId::new(Uuid::new_v4());
        store
            .insert_account_id(account_id)
            .await
            .expect("could not insert account id");

        for data_type in data_types {
            store
                .create_data_type(
                    DataType::from_str(data_type).expect("could not parse data type"),
                    OwnedById::new(account_id),
                    CreatedById::new(account_id),
                )
                .await?;
        }

        for property_type in property_types {
            store
                .create_property_type(
                    PropertyType::from_str(property_type).expect("could not parse property type"),
                    OwnedById::new(account_id),
                    CreatedById::new(account_id),
                )
                .await?;
        }

        for entity_type in entity_types {
            store
                .create_entity_type(
                    EntityType::from_str(entity_type).expect("could not parse entity type"),
                    OwnedById::new(account_id),
                    CreatedById::new(account_id),
                )
                .await?;
        }

        Ok(DatabaseApi { store, account_id })
    }
}

// TODO: Add get_all_* methods
impl DatabaseApi<'_> {
    pub async fn create_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<OntologyElementMetadata, InsertionError> {
        self.store
            .create_data_type(
                data_type,
                OwnedById::new(self.account_id),
                CreatedById::new(self.account_id),
            )
            .await
    }

    pub async fn get_data_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<DataTypeWithMetadata, QueryError> {
        let vertex = self
            .store
            .get_data_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .remove(&GraphElementId::OntologyElementId(uri.clone().into()))
            .expect("no data type found");

        match vertex {
            Vertex::DataType(data_type_with_metadata) => Ok(data_type_with_metadata),
            _ => unreachable!(),
        }
    }

    pub async fn update_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        self.store
            .update_data_type(data_type, UpdatedById::new(self.account_id))
            .await
    }

    pub async fn create_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<OntologyElementMetadata, InsertionError> {
        self.store
            .create_property_type(
                property_type,
                OwnedById::new(self.account_id),
                CreatedById::new(self.account_id),
            )
            .await
    }

    pub async fn get_property_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<PropertyTypeWithMetadata, QueryError> {
        let vertex = self
            .store
            .get_property_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .remove(&GraphElementId::OntologyElementId(uri.clone().into()))
            .expect("no property type found");

        match vertex {
            Vertex::PropertyType(property_type_with_metadata) => Ok(property_type_with_metadata),
            _ => unreachable!(),
        }
    }

    pub async fn update_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        self.store
            .update_property_type(property_type, UpdatedById::new(self.account_id))
            .await
    }

    pub async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<OntologyElementMetadata, InsertionError> {
        self.store
            .create_entity_type(
                entity_type,
                OwnedById::new(self.account_id),
                CreatedById::new(self.account_id),
            )
            .await
    }

    pub async fn get_entity_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<EntityTypeWithMetadata, QueryError> {
        let vertex = self
            .store
            .get_entity_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .remove(&GraphElementId::OntologyElementId(uri.clone().into()))
            .expect("no entity type found");

        match vertex {
            Vertex::EntityType(entity_type) => Ok(entity_type),
            _ => unreachable!(),
        }
    }

    pub async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        self.store
            .update_entity_type(entity_type, UpdatedById::new(self.account_id))
            .await
    }

    pub async fn create_entity(
        &mut self,
        entity: EntityProperties,
        entity_type_id: VersionedUri,
        entity_uuid: Option<EntityUuid>,
    ) -> Result<EntityMetadata, InsertionError> {
        self.store
            .create_entity(
                entity,
                entity_type_id,
                OwnedById::new(self.account_id),
                entity_uuid,
                CreatedById::new(self.account_id),
                None,
            )
            .await
    }

    pub async fn get_entity(&self, entity_id: EntityId) -> Result<Entity, QueryError> {
        let vertex = self
            .store
            .get_entity(&StructuralQuery {
                filter: Filter::for_latest_entity_by_entity_id(entity_id),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .remove(&GraphElementId::KnowledgeGraphElementId(entity_id))
            .expect("no entity found");

        match vertex {
            Vertex::Entity(entity) => Ok(entity),
            _ => unreachable!(),
        }
    }

    pub async fn update_entity(
        &mut self,
        entity_id: EntityId,
        entity: EntityProperties,
        entity_type_id: VersionedUri,
    ) -> Result<EntityMetadata, UpdateError> {
        self.store
            .update_entity(
                entity_id,
                entity,
                entity_type_id,
                UpdatedById::new(self.account_id),
            )
            .await
    }

    async fn create_link_entity(
        &mut self,
        entity: EntityProperties,
        entity_type_id: VersionedUri,
        entity_uuid: Option<EntityUuid>,
        left_entity_id: EntityId,
        right_entity_id: EntityId,
    ) -> Result<EntityMetadata, InsertionError> {
        self.store
            .create_entity(
                entity,
                entity_type_id,
                OwnedById::new(self.account_id),
                entity_uuid,
                CreatedById::new(self.account_id),
                Some(LinkEntityMetadata::new(
                    left_entity_id,
                    right_entity_id,
                    None,
                    None,
                )),
            )
            .await
    }

    pub async fn get_link_entity_target(
        &self,
        source_entity_uuid: EntityUuid,
        link_type_id: VersionedUri,
    ) -> Result<Entity, QueryError> {
        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(Some(
                    Box::new(EntityQueryPath::Uuid),
                )))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_uuid.as_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Type(
                    EntityTypeQueryPath::BaseUri,
                ))),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    link_type_id.base_uri().as_str(),
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Type(
                    EntityTypeQueryPath::Version,
                ))),
                Some(FilterExpression::Parameter(Parameter::SignedInteger(
                    link_type_id.version().into(),
                ))),
            ),
        ]);

        self.store
            .get_entity(&StructuralQuery {
                filter,
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .into_iter()
            .map(|(_, vertex)| match vertex {
                Vertex::Entity(entity) => Ok(entity),
                _ => unreachable!(),
            })
            .next()
            .expect("no entity found")
    }

    pub async fn get_latest_entity_links(
        &self,
        source_entity_id: EntityId,
    ) -> Result<Vec<Entity>, QueryError> {
        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(None))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.entity_uuid().as_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(Some(
                    Box::new(EntityQueryPath::OwnedById),
                )))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.owned_by_id().as_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Version)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "latest",
                )))),
            ),
        ]);

        Ok(self
            .store
            .get_entity(&StructuralQuery {
                filter,
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .into_iter()
            .map(|(_, vertex)| match vertex {
                Vertex::Entity(entity) => entity,
                _ => unreachable!(),
            })
            .collect())
    }

    async fn archive_entity(&mut self, link_entity_id: EntityId) -> Result<(), ArchivalError> {
        self.store
            .archive_entity(link_entity_id, UpdatedById::new(self.account_id))
            .await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
