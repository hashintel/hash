mod data_type;
mod entity;
mod entity_type;
mod links;
mod property_type;

use std::{borrow::Cow, str::FromStr};

use error_stack::Result;
use graph::{
    knowledge::{
        Entity, EntityQueryPath, EntityUuid, LinkEntityMetadata, PersistedEntity,
        PersistedEntityMetadata,
    },
    ontology::{
        EntityTypeQueryPath, PersistedDataType, PersistedEntityType, PersistedOntologyMetadata,
        PersistedPropertyType,
    },
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::identifier::{account::AccountId, GraphElementIdentifier},
    store::{
        error::ArchivalError,
        query::{Filter, FilterExpression, Parameter},
        AccountStore, AsClient, DataTypeStore, DatabaseConnectionInfo, DatabaseType, EntityStore,
        EntityTypeStore, InsertionError, PostgresStore, PostgresStorePool, PropertyTypeStore,
        QueryError, StorePool, UpdateError,
    },
    subgraph::{GraphResolveDepths, StructuralQuery, Vertex},
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
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
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
    ) -> Result<PersistedDataType, QueryError> {
        let vertex = self
            .store
            .get_data_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .remove(&GraphElementIdentifier::OntologyElementId(uri.clone()))
            .expect("no data type found");

        match vertex {
            Vertex::DataType(persisted_data_type) => Ok(persisted_data_type),
            _ => unreachable!(),
        }
    }

    pub async fn update_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        self.store
            .update_data_type(data_type, UpdatedById::new(self.account_id))
            .await
    }

    pub async fn create_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
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
    ) -> Result<PersistedPropertyType, QueryError> {
        let vertex = self
            .store
            .get_property_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .remove(&GraphElementIdentifier::OntologyElementId(uri.clone()))
            .expect("no property type found");

        match vertex {
            Vertex::PropertyType(persisted_property_type) => Ok(persisted_property_type),
            _ => unreachable!(),
        }
    }

    pub async fn update_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        self.store
            .update_property_type(property_type, UpdatedById::new(self.account_id))
            .await
    }

    pub async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
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
    ) -> Result<PersistedEntityType, QueryError> {
        let vertex = self
            .store
            .get_entity_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .remove(&GraphElementIdentifier::OntologyElementId(uri.clone()))
            .expect("no entity type found");

        match vertex {
            Vertex::EntityType(persisted_entity_type) => Ok(persisted_entity_type),
            _ => unreachable!(),
        }
    }

    pub async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        self.store
            .update_entity_type(entity_type, UpdatedById::new(self.account_id))
            .await
    }

    pub async fn create_entity(
        &mut self,
        entity: Entity,
        entity_type_id: VersionedUri,
        entity_uuid: Option<EntityUuid>,
    ) -> Result<PersistedEntityMetadata, InsertionError> {
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

    pub async fn get_entity(&self, entity_uuid: EntityUuid) -> Result<PersistedEntity, QueryError> {
        let vertex = self
            .store
            .get_entity(&StructuralQuery {
                filter: Filter::for_latest_entity_by_entity_uuid(entity_uuid),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .remove(&GraphElementIdentifier::KnowledgeGraphElementId(
                entity_uuid,
            ))
            .expect("no entity found");

        match vertex {
            Vertex::Entity(persisted_entity) => Ok(persisted_entity),
            _ => unreachable!(),
        }
    }

    pub async fn update_entity(
        &mut self,
        entity_uuid: EntityUuid,
        entity: Entity,
        entity_type_id: VersionedUri,
    ) -> Result<PersistedEntityMetadata, UpdateError> {
        self.store
            .update_entity(
                entity_uuid,
                entity,
                entity_type_id,
                UpdatedById::new(self.account_id),
            )
            .await
    }

    async fn create_link_entity(
        &mut self,
        entity: Entity,
        entity_type_id: VersionedUri,
        entity_uuid: Option<EntityUuid>,
        left_entity_uuid: EntityUuid,
        right_entity_uuid: EntityUuid,
    ) -> Result<PersistedEntityMetadata, InsertionError> {
        self.store
            .create_entity(
                entity,
                entity_type_id,
                OwnedById::new(self.account_id),
                entity_uuid,
                CreatedById::new(self.account_id),
                Some(LinkEntityMetadata::new(
                    left_entity_uuid,
                    right_entity_uuid,
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
    ) -> Result<PersistedEntity, QueryError> {
        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(Some(
                    Box::new(EntityQueryPath::Id),
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
                Vertex::Entity(persisted_entity) => Ok(persisted_entity),
                _ => unreachable!(),
            })
            .next()
            .expect("no entity found")
    }

    pub async fn get_latest_entity_links(
        &self,
        source_entity_uuid: EntityUuid,
    ) -> Result<Vec<PersistedEntity>, QueryError> {
        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(None))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_uuid.as_uuid(),
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
                Vertex::Entity(persisted_entity) => persisted_entity,
                _ => unreachable!(),
            })
            .collect())
    }

    async fn archive_entity(&mut self, link_entity_uuid: EntityUuid) -> Result<(), ArchivalError> {
        self.store
            .archive_entity(
                link_entity_uuid,
                OwnedById::new(self.account_id),
                UpdatedById::new(self.account_id),
            )
            .await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
