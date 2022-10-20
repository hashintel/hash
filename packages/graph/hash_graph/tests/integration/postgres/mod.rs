mod data_type;
mod entity;
mod entity_type;
mod link_type;
mod links;
mod property_type;

use std::str::FromStr;

use error_stack::{Report, Result};
use graph::{
    knowledge::{Entity, EntityId, Link, PersistedEntity, PersistedEntityMetadata, PersistedLink},
    ontology::{
        AccountId, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedOntologyMetadata, PersistedPropertyType,
    },
    store::{
        error::LinkRemovalError,
        query::{Expression, Literal, Path, PathSegment},
        AccountStore, AsClient, DataTypeStore, DatabaseConnectionInfo, DatabaseType, EntityStore,
        EntityTypeStore, InsertionError, LinkStore, LinkTypeStore, PostgresStore,
        PostgresStorePool, PropertyTypeStore, QueryError, StorePool, UpdateError,
    },
    subgraph::{GraphElementIdentifier, GraphResolveDepths, StructuralQuery, Vertex},
};
use tokio_postgres::{NoTls, Transaction};
use type_system::{uri::VersionedUri, DataType, EntityType, LinkType, PropertyType};
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

    pub async fn seed<D, P, L, E>(
        &mut self,
        data_types: D,
        property_types: P,
        link_types: L,
        entity_types: E,
    ) -> Result<DatabaseApi<'_>, InsertionError>
    where
        D: IntoIterator<Item = &'static str>,
        P: IntoIterator<Item = &'static str>,
        L: IntoIterator<Item = &'static str>,
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
                    account_id,
                    account_id,
                )
                .await?;
        }

        for property_type in property_types {
            store
                .create_property_type(
                    PropertyType::from_str(property_type).expect("could not parse property type"),
                    account_id,
                    account_id,
                )
                .await?;
        }

        // Insert link types before entity types so entity types can refer to them
        for link_type in link_types {
            store
                .create_link_type(
                    LinkType::from_str(link_type).expect("could not parse link type"),
                    account_id,
                    account_id,
                )
                .await?;
        }

        for entity_type in entity_types {
            store
                .create_entity_type(
                    EntityType::from_str(entity_type).expect("could not parse entity type"),
                    account_id,
                    account_id,
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
            .create_data_type(data_type, self.account_id, self.account_id)
            .await
    }

    pub async fn get_data_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<PersistedDataType, QueryError> {
        let vertex = self
            .store
            .get_data_type(&StructuralQuery {
                expression: Expression::for_versioned_uri(uri),
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
            .update_data_type(data_type, self.account_id)
            .await
    }

    pub async fn create_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
        self.store
            .create_property_type(property_type, self.account_id, self.account_id)
            .await
    }

    pub async fn get_property_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<PersistedPropertyType, QueryError> {
        let vertex = self
            .store
            .get_property_type(&StructuralQuery {
                expression: Expression::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .vertices
            .remove(&GraphElementIdentifier::OntologyElementId(uri.clone()))
            .expect("no property type found");

        match vertex {
            Vertex::PropertyType(persisted_data_type) => Ok(persisted_data_type),
            _ => unreachable!(),
        }
    }

    pub async fn update_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        self.store
            .update_property_type(property_type, self.account_id)
            .await
    }

    pub async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
        self.store
            .create_entity_type(entity_type, self.account_id, self.account_id)
            .await
    }

    pub async fn get_entity_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<PersistedEntityType, QueryError> {
        Ok(self
            .store
            .get_entity_type(&StructuralQuery {
                expression: Expression::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .pop()
            .expect("no entity type found")
            .entity_type)
    }

    pub async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        self.store
            .update_entity_type(entity_type, self.account_id)
            .await
    }

    pub async fn create_link_type(
        &mut self,
        link_type: LinkType,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
        self.store
            .create_link_type(link_type, self.account_id, self.account_id)
            .await
    }

    pub async fn get_link_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<PersistedLinkType, QueryError> {
        Ok(self
            .store
            .get_link_type(&StructuralQuery {
                expression: Expression::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .pop()
            .expect("no link type found")
            .link_type)
    }

    pub async fn update_link_type(
        &mut self,
        link_type: LinkType,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        self.store
            .update_link_type(link_type, self.account_id)
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
                self.account_id,
                entity_id,
                self.account_id,
            )
            .await
    }

    pub async fn get_entity(&mut self, entity_id: EntityId) -> Result<PersistedEntity, QueryError> {
        Ok(self
            .store
            .get_entity(&StructuralQuery {
                expression: Expression::for_latest_entity_id(entity_id),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .pop()
            .expect("no entity found")
            .entity)
    }

    pub async fn update_entity(
        &mut self,
        entity_id: EntityId,
        entity: Entity,
        entity_type_id: VersionedUri,
    ) -> Result<PersistedEntityMetadata, UpdateError> {
        self.store
            .update_entity(entity_id, entity, entity_type_id, self.account_id)
            .await
    }

    async fn create_link(
        &mut self,
        source_entity_id: EntityId,
        target_entity_id: EntityId,
        link_type_id: VersionedUri,
    ) -> Result<(), InsertionError> {
        let link = Link::new(source_entity_id, target_entity_id, link_type_id, None);
        self.store
            .create_link(&link, self.account_id, self.account_id)
            .await
    }

    async fn create_ordered_link(
        &mut self,
        source_entity_id: EntityId,
        target_entity_id: EntityId,
        link_type_id: VersionedUri,
        index: i32,
    ) -> Result<(), InsertionError> {
        let link = Link::new(
            source_entity_id,
            target_entity_id,
            link_type_id,
            Some(index),
        );
        self.store
            .create_link(&link, self.account_id, self.account_id)
            .await
    }

    pub async fn get_link_target(
        &self,
        source_entity_id: EntityId,
        link_type_id: VersionedUri,
    ) -> Result<PersistedLink, QueryError> {
        Ok(self
            .store
            .get_links(&StructuralQuery {
                expression: Expression::All(vec![
                    Expression::for_link_by_source_entity_id(source_entity_id),
                    Expression::Eq(vec![
                        Expression::Path(Path {
                            segments: vec![
                                PathSegment {
                                    identifier: "type".to_owned(),
                                },
                                PathSegment {
                                    identifier: "baseUri".to_owned(),
                                },
                            ],
                        }),
                        Expression::Literal(Literal::String(link_type_id.base_uri().to_string())),
                    ]),
                    Expression::Eq(vec![
                        Expression::Path(Path {
                            segments: vec![
                                PathSegment {
                                    identifier: "type".to_owned(),
                                },
                                PathSegment {
                                    identifier: "version".to_owned(),
                                },
                            ],
                        }),
                        Expression::Literal(Literal::Float(link_type_id.version() as f64)),
                    ]),
                ]),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .pop()
            .ok_or_else(|| Report::new(QueryError).attach_printable("no link found"))?
            .link
            .clone())
    }

    pub async fn get_entity_links(
        &self,
        source_entity_id: EntityId,
    ) -> Result<Vec<PersistedLink>, QueryError> {
        Ok(self
            .store
            .get_links(&StructuralQuery {
                expression: Expression::for_link_by_source_entity_id(source_entity_id),
                graph_resolve_depths: GraphResolveDepths::zeroed(),
            })
            .await?
            .into_iter()
            .map(|link_rooted_subgraph| link_rooted_subgraph.link)
            .collect())
    }

    async fn remove_link(
        &mut self,
        source_entity_id: EntityId,
        target_entity_id: EntityId,
        link_type_id: VersionedUri,
    ) -> Result<(), LinkRemovalError> {
        let link = Link::new(source_entity_id, target_entity_id, link_type_id, None);
        self.store.remove_link(&link, self.account_id).await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
