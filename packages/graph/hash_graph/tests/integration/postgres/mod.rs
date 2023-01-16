mod data_type;
mod entity;
mod entity_type;
mod links;
mod property_type;

use std::borrow::Cow;

use error_stack::Result;
use graph::{
    identifier::{
        account::AccountId,
        knowledge::EntityId,
        ontology::OntologyTypeEditionId,
        time::{
            TimeIntervalBound, Timestamp, TransactionTime, UnresolvedImage, UnresolvedKernel,
            UnresolvedProjection, UnresolvedTimeProjection,
        },
        EntityVertexId, GraphElementVertexId,
    },
    knowledge::{
        Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityQueryPath, EntityUuid,
        LinkData,
    },
    ontology::{
        DataTypeWithMetadata, EntityTypeQueryPath, EntityTypeWithMetadata, OntologyElementMetadata,
        PropertyTypeWithMetadata,
    },
    provenance::{OwnedById, UpdatedById},
    store::{
        query::{Filter, FilterExpression, Parameter},
        AccountStore, DataTypeStore, DatabaseConnectionInfo, DatabaseType, EntityStore,
        EntityTypeStore, InsertionError, PostgresStore, PostgresStorePool, PropertyTypeStore,
        QueryError, Record, Store, StorePool, UpdateError,
    },
    subgraph::{edges::GraphResolveDepths, query::StructuralQuery},
};
use tokio_postgres::{NoTls, Transaction};
use type_system::{repr, uri::VersionedUri, DataType, EntityType, PropertyType};
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
        let mut store = self
            .connection
            .transaction()
            .await
            .expect("could not start test transaction");

        let account_id = AccountId::new(Uuid::new_v4());
        store
            .insert_account_id(account_id)
            .await
            .expect("could not insert account id");

        for data_type_str in data_types {
            let data_type_repr: repr::DataType = serde_json::from_str(data_type_str)
                .expect("could not parse data type representation");
            store
                .create_data_type(
                    DataType::try_from(data_type_repr).expect("could not parse data type"),
                    OwnedById::new(account_id),
                    UpdatedById::new(account_id),
                )
                .await?;
        }

        for property_type_str in property_types {
            let property_type_repr: repr::PropertyType = serde_json::from_str(property_type_str)
                .expect("could not parse property type representation");
            store
                .create_property_type(
                    PropertyType::try_from(property_type_repr)
                        .expect("could not parse property type"),
                    OwnedById::new(account_id),
                    UpdatedById::new(account_id),
                )
                .await?;
        }

        for entity_type_str in entity_types {
            let entity_type_repr: repr::EntityType = serde_json::from_str(entity_type_str)
                .expect("could not parse entity type representation");
            store
                .create_entity_type(
                    EntityType::try_from(entity_type_repr).expect("could not parse entity type"),
                    OwnedById::new(account_id),
                    UpdatedById::new(account_id),
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
                UpdatedById::new(self.account_id),
            )
            .await
    }

    pub async fn get_data_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<DataTypeWithMetadata, QueryError> {
        Ok(self
            .store
            .get_data_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::default(),
                time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                    kernel: UnresolvedKernel::new(None),
                    image: UnresolvedImage::new(
                        Some(TimeIntervalBound::Unbounded),
                        Some(TimeIntervalBound::Unbounded),
                    ),
                }),
            })
            .await?
            .vertices
            .data_types
            .remove(&OntologyTypeEditionId::from(uri))
            .expect("no data type found"))
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
                UpdatedById::new(self.account_id),
            )
            .await
    }

    pub async fn get_property_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<PropertyTypeWithMetadata, QueryError> {
        Ok(self
            .store
            .get_property_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::default(),
                time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                    kernel: UnresolvedKernel::new(None),
                    image: UnresolvedImage::new(
                        Some(TimeIntervalBound::Unbounded),
                        Some(TimeIntervalBound::Unbounded),
                    ),
                }),
            })
            .await?
            .vertices
            .property_types
            .remove(&OntologyTypeEditionId::from(uri))
            .expect("no property type found"))
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
                UpdatedById::new(self.account_id),
            )
            .await
    }

    pub async fn get_entity_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<EntityTypeWithMetadata, QueryError> {
        Ok(self
            .store
            .get_entity_type(&StructuralQuery {
                filter: Filter::for_versioned_uri(uri),
                graph_resolve_depths: GraphResolveDepths::default(),
                time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                    kernel: UnresolvedKernel::new(None),
                    image: UnresolvedImage::new(
                        Some(TimeIntervalBound::Unbounded),
                        Some(TimeIntervalBound::Unbounded),
                    ),
                }),
            })
            .await?
            .vertices
            .entity_types
            .remove(&OntologyTypeEditionId::from(uri))
            .expect("no entity type found"))
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
        properties: EntityProperties,
        entity_type_id: VersionedUri,
        entity_uuid: Option<EntityUuid>,
    ) -> Result<EntityMetadata, InsertionError> {
        self.store
            .create_entity(
                OwnedById::new(self.account_id),
                entity_uuid,
                None,
                UpdatedById::new(self.account_id),
                false,
                entity_type_id,
                properties,
                None,
            )
            .await
    }

    pub async fn get_entity(
        &self,
        entity_id: EntityId,
        timestamp: Timestamp<TransactionTime>,
    ) -> Result<Entity, QueryError> {
        let entity_vertex_id = EntityVertexId::new(entity_id, timestamp.cast());
        Ok(self
            .store
            .get_entity(&StructuralQuery {
                filter: Entity::create_filter_for_vertex_id(&entity_vertex_id),
                graph_resolve_depths: GraphResolveDepths::default(),
                time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                    kernel: UnresolvedKernel::new(None),
                    image: UnresolvedImage::new(
                        Some(TimeIntervalBound::Unbounded),
                        Some(TimeIntervalBound::Unbounded),
                    ),
                }),
            })
            .await?
            .vertices
            .entities
            .remove(&entity_vertex_id)
            .expect("no entity found"))
    }

    pub async fn update_entity(
        &mut self,
        entity_id: EntityId,
        properties: EntityProperties,
        entity_type_id: VersionedUri,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        self.store
            .update_entity(
                entity_id,
                None,
                UpdatedById::new(self.account_id),
                false,
                entity_type_id,
                properties,
                link_order,
            )
            .await
    }

    async fn create_link_entity(
        &mut self,
        properties: EntityProperties,
        entity_type_id: VersionedUri,
        entity_uuid: Option<EntityUuid>,
        left_entity_id: EntityId,
        right_entity_id: EntityId,
    ) -> Result<EntityMetadata, InsertionError> {
        self.store
            .create_entity(
                OwnedById::new(self.account_id),
                entity_uuid,
                None,
                UpdatedById::new(self.account_id),
                false,
                entity_type_id,
                properties,
                Some(LinkData::new(left_entity_id, right_entity_id, None, None)),
            )
            .await
    }

    pub async fn get_link_entity_target(
        &self,
        source_entity_id: EntityId,
        link_type_id: VersionedUri,
    ) -> Result<Entity, QueryError> {
        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(
                    Box::new(EntityQueryPath::Uuid),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.entity_uuid().as_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(
                    Box::new(EntityQueryPath::OwnedById),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.owned_by_id().as_uuid(),
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
                graph_resolve_depths: GraphResolveDepths::default(),
                time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                    kernel: UnresolvedKernel::new(None),
                    image: UnresolvedImage::new(
                        Some(TimeIntervalBound::Unbounded),
                        Some(TimeIntervalBound::Unbounded),
                    ),
                }),
            })
            .await?;

        let roots = subgraph
            .roots
            .into_iter()
            .filter_map(|edition_id| match edition_id {
                GraphElementVertexId::Ontology(_) => None,
                GraphElementVertexId::KnowledgeGraph(edition_id) => {
                    subgraph.vertices.entities.remove(&edition_id)
                }
            })
            .collect::<Vec<_>>();

        match roots.len() {
            1 => Ok(roots.into_iter().next().unwrap()),
            len => panic!("unexpected number of entities found, expected 1 but received {len}"),
        }
    }

    pub async fn get_latest_entity_links(
        &self,
        source_entity_id: EntityId,
    ) -> Result<Vec<Entity>, QueryError> {
        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(
                    Box::new(EntityQueryPath::Uuid),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.entity_uuid().as_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(
                    Box::new(EntityQueryPath::OwnedById),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.owned_by_id().as_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::ProjectedTime)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "latest",
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Archived)),
                Some(FilterExpression::Parameter(Parameter::Boolean(false))),
            ),
        ]);

        let mut subgraph = self
            .store
            .get_entity(&StructuralQuery {
                filter,
                graph_resolve_depths: GraphResolveDepths::default(),
                time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                    kernel: UnresolvedKernel::new(None),
                    image: UnresolvedImage::new(
                        Some(TimeIntervalBound::Unbounded),
                        Some(TimeIntervalBound::Unbounded),
                    ),
                }),
            })
            .await?;

        Ok(subgraph
            .roots
            .into_iter()
            .filter_map(|edition_id| match edition_id {
                GraphElementVertexId::Ontology(_) => None,
                GraphElementVertexId::KnowledgeGraph(edition_id) => {
                    subgraph.vertices.entities.remove(&edition_id)
                }
            })
            .collect())
    }

    async fn archive_entity(
        &mut self,
        entity_id: EntityId,
        properties: EntityProperties,
        entity_type_id: VersionedUri,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        self.store
            .update_entity(
                entity_id,
                None,
                UpdatedById::new(self.account_id),
                true,
                entity_type_id,
                properties,
                link_order,
            )
            .await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
