mod data_type;
mod entity;
mod entity_type;
mod links;
mod property_type;

use std::{borrow::Cow, str::FromStr};

use error_stack::Result;
use graph::{
    identifier::{AccountId, EntityIdentifier, GraphElementEditionIdentifier},
    knowledge::{
        Entity, EntityId, EntityQueryPath, LinkEntityMetadata, PersistedEntity,
        PersistedEntityIdentifier, PersistedEntityMetadata,
    },
    ontology::{
        EntityTypeQueryPath, PersistedDataType, PersistedEntityType, PersistedOntologyMetadata,
        PersistedPropertyType,
    },
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::identifier::GraphElementIdentifier,
    store::{
        error::ArchivalError,
        query::{Filter, FilterExpression, Parameter},
        AccountStore, AsClient, DataTypeStore, DatabaseConnectionInfo, DatabaseType, EntityStore,
        EntityTypeStore, InsertionError, PostgresStore, PostgresStorePool, PropertyTypeStore,
        QueryError, StorePool, UpdateError,
    },
    subgraph::{GraphResolveDepths, KnowledgeGraphVertex, OntologyVertex, StructuralQuery, Vertex},
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
        let mut subgraph = self
            .store
            .get_data_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?;

        let vertex = subgraph
            .vertices
            .remove(&subgraph.roots.pop().expect("no data type found"))
            .unwrap();

        match vertex {
            Vertex::Ontology(OntologyVertex::DataType(persisted_data_type)) => {
                Ok(persisted_data_type)
            }
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
        let mut subgraph = self
            .store
            .get_property_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?;

        let vertex = subgraph
            .vertices
            .remove(&subgraph.roots.pop().expect("no property type found"))
            .unwrap();

        match vertex {
            Vertex::Ontology(OntologyVertex::PropertyType(persisted_property_type)) => {
                Ok(persisted_property_type)
            }
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
        let mut subgraph = self
            .store
            .get_entity_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?;

        let vertex = subgraph
            .vertices
            .remove(&subgraph.roots.pop().expect("no entity type found"))
            .unwrap();

        match vertex {
            Vertex::Ontology(OntologyVertex::EntityType(persisted_entity_type)) => {
                Ok(persisted_entity_type)
            }
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
        entity_id: Option<EntityId>,
    ) -> Result<PersistedEntityMetadata, InsertionError> {
        self.store
            .create_entity(
                entity,
                entity_type_id,
                OwnedById::new(self.account_id),
                entity_id,
                CreatedById::new(self.account_id),
                None,
            )
            .await
    }

    pub async fn get_entity(
        &self,
        entity_edition_identifier: &PersistedEntityIdentifier,
    ) -> Result<PersistedEntity, QueryError> {
        let mut subgraph = self
            .store
            .get_entity(&StructuralQuery {
                filter: Filter::for_entity_by_entity_id_and_entity_version(
                    entity_edition_identifier,
                ),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?;

        let vertex = subgraph
            .vertices
            .remove(&subgraph.roots.pop().expect("no entity found"))
            .unwrap();

        match vertex {
            Vertex::KnowledgeGraph(KnowledgeGraphVertex::Entity(persisted_entity)) => {
                Ok(persisted_entity)
            }
            _ => unreachable!(),
        }
    }

    pub async fn update_entity(
        &mut self,
        entity_identifier: EntityIdentifier,
        entity: Entity,
        entity_type_id: VersionedUri,
    ) -> Result<PersistedEntityMetadata, UpdateError> {
        self.store
            .update_entity(
                entity_identifier,
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
        entity_id: Option<EntityId>,
        left_entity_id: EntityIdentifier,
        right_entity_id: EntityIdentifier,
    ) -> Result<PersistedEntityMetadata, InsertionError> {
        self.store
            .create_entity(
                entity,
                entity_type_id,
                OwnedById::new(self.account_id),
                entity_id,
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
        source_entity_identifier: EntityIdentifier,
        link_type_id: VersionedUri,
    ) -> Result<PersistedEntity, QueryError> {
        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(Some(
                    Box::new(EntityQueryPath::Id),
                )))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_identifier.entity_id().as_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(Some(
                    Box::new(EntityQueryPath::OwnedById),
                )))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_identifier.owned_by_id().as_uuid(),
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

        let mut subgraph = self
            .store
            .get_entity(&StructuralQuery {
                filter,
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?;

        let vertex = subgraph
            .vertices
            .remove(&subgraph.roots.pop().expect("no entity found"))
            .unwrap();

        match vertex {
            Vertex::KnowledgeGraph(KnowledgeGraphVertex::Entity(persisted_entity)) => {
                Ok(persisted_entity)
            }
            _ => unreachable!(),
        }
    }

    pub async fn get_latest_entity_links(
        &self,
        source_entity_identifier: EntityIdentifier,
    ) -> Result<Vec<PersistedEntity>, QueryError> {
        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(Some(
                    Box::new(EntityQueryPath::Id),
                )))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_identifier.entity_id().as_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(Some(
                    Box::new(EntityQueryPath::OwnedById),
                )))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_identifier.owned_by_id().as_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Version)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "latest",
                )))),
            ),
        ]);

        let mut subgraph = self
            .store
            .get_entity(&StructuralQuery {
                filter,
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?;

        Ok(subgraph
            .roots
            .into_iter()
            .map(|element_id| subgraph.vertices.remove(&element_id))
            .flatten() // Filter out Option::None
            .map(|vertex| match vertex {
                Vertex::KnowledgeGraph(KnowledgeGraphVertex::Entity(persisted_entity)) => {
                    persisted_entity
                }
                _ => unreachable!(),
            })
            .collect())
    }

    async fn archive_entity(
        &mut self,
        link_entity_identifier: EntityIdentifier,
    ) -> Result<(), ArchivalError> {
        self.store
            .archive_entity(link_entity_identifier, UpdatedById::new(self.account_id))
            .await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
