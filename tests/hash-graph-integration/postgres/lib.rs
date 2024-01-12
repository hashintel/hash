#![feature(associated_type_bounds, lint_reasons)]
#![allow(
    clippy::missing_panics_doc,
    clippy::missing_errors_doc,
    clippy::unwrap_used
)]

mod data_type;
mod entity;
mod entity_type;
mod links;
mod property_type;

use std::{borrow::Cow, str::FromStr};

use authorization::{
    schema::{
        DataTypeRelationAndSubject, DataTypeViewerSubject, EntityTypeInstantiatorSubject,
        EntityTypeRelationAndSubject, EntityTypeSetting, EntityTypeSettingSubject,
        EntityTypeViewerSubject, PropertyTypeRelationAndSubject, PropertyTypeSetting,
        PropertyTypeSettingSubject, PropertyTypeViewerSubject, WebOwnerSubject,
    },
    NoAuthorization,
};
use error_stack::Result;
use graph::{
    knowledge::EntityQueryPath,
    load_env,
    ontology::EntityTypeQueryPath,
    store::{
        query::{Filter, FilterExpression, Parameter},
        AccountStore, ConflictBehavior, DataTypeStore, DatabaseConnectionInfo, DatabaseType,
        EntityStore, EntityTypeStore, InsertionError, PostgresStore, PostgresStorePool,
        PropertyTypeStore, QueryError, StorePool, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::{
            DataTypeVertexId, EntityTypeVertexId, GraphElementVertexId, PropertyTypeVertexId,
        },
        query::StructuralQuery,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
    },
    Environment,
};
use graph_types::{
    account::AccountId,
    knowledge::{
        entity::{Entity, EntityId, EntityMetadata, EntityProperties, EntityUuid},
        link::{EntityLinkOrder, LinkData},
    },
    ontology::{
        DataTypeMetadata, DataTypeWithMetadata, EntityTypeMetadata, EntityTypeWithMetadata,
        OntologyTypeClassificationMetadata, OntologyTypeVersion, PartialDataTypeMetadata,
        PartialEntityTypeMetadata, PartialPropertyTypeMetadata, PropertyTypeMetadata,
        PropertyTypeWithMetadata,
    },
    owned_by_id::OwnedById,
};
use temporal_versioning::{DecisionTime, LimitedTemporalBound, TemporalBound, Timestamp};
use time::{format_description::well_known::Iso8601, Duration, OffsetDateTime};
use tokio_postgres::{NoTls, Transaction};
use type_system::{url::VersionedUrl, DataType, EntityType, PropertyType};
use uuid::Uuid;

pub struct DatabaseTestWrapper {
    _pool: PostgresStorePool<NoTls>,
    connection: <PostgresStorePool<NoTls> as StorePool>::Store<'static>,
}

pub struct DatabaseApi<'pool> {
    store: PostgresStore<Transaction<'pool>>,
    account_id: AccountId,
}

const fn data_type_relationships() -> [DataTypeRelationAndSubject; 1] {
    [DataTypeRelationAndSubject::Viewer {
        subject: DataTypeViewerSubject::Public,
        level: 0,
    }]
}

const fn property_type_relationships() -> [PropertyTypeRelationAndSubject; 2] {
    [
        PropertyTypeRelationAndSubject::Setting {
            subject: PropertyTypeSettingSubject::Setting {
                id: PropertyTypeSetting::UpdateFromWeb,
            },
            level: 0,
        },
        PropertyTypeRelationAndSubject::Viewer {
            subject: PropertyTypeViewerSubject::Public,
            level: 0,
        },
    ]
}

const fn entity_type_relationships() -> [EntityTypeRelationAndSubject; 3] {
    [
        EntityTypeRelationAndSubject::Setting {
            subject: EntityTypeSettingSubject::Setting {
                id: EntityTypeSetting::UpdateFromWeb,
            },
            level: 0,
        },
        EntityTypeRelationAndSubject::Viewer {
            subject: EntityTypeViewerSubject::Public,
            level: 0,
        },
        EntityTypeRelationAndSubject::Instantiator {
            subject: EntityTypeInstantiatorSubject::Public,
            level: 0,
        },
    ]
}

impl DatabaseTestWrapper {
    pub async fn new() -> Self {
        load_env(Environment::Test);

        let user = std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned());
        let password =
            std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned());
        let host = std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned());
        let port = std::env::var("HASH_GRAPH_PG_PORT")
            .map(|p| p.parse::<u16>().unwrap())
            .unwrap_or(5432);
        let database =
            std::env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned());

        let connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            user,
            password,
            host,
            port,
            database,
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
        propertys: D,
        property_types: P,
        entity_types: E,
    ) -> Result<DatabaseApi<'_>, InsertionError>
    where
        D: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
        P: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
        E: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
    {
        let mut store = self
            .connection
            .transaction()
            .await
            .expect("could not start test transaction");

        let account_id = AccountId::new(Uuid::new_v4());
        store
            .insert_account_id(account_id, &mut NoAuthorization, account_id)
            .await
            .expect("could not insert account id");
        store
            .insert_web_id(
                account_id,
                &mut NoAuthorization,
                OwnedById::new(account_id.into_uuid()),
                WebOwnerSubject::Account { id: account_id },
            )
            .await
            .expect("could not create web id");

        let data_types_iter = propertys.into_iter().map(|data_type_str| {
            let data_type: DataType = serde_json::from_str(data_type_str)
                .expect("could not parse data type representation");

            let metadata = PartialDataTypeMetadata {
                record_id: data_type.id().clone().into(),
                classification: OntologyTypeClassificationMetadata::Owned {
                    owned_by_id: OwnedById::new(account_id.into_uuid()),
                },
            };

            (data_type, metadata)
        });
        store
            .create_data_types(
                account_id,
                &mut NoAuthorization,
                data_types_iter,
                ConflictBehavior::Skip,
                data_type_relationships(),
            )
            .await?;

        let property_types_iter = property_types.into_iter().map(|property_type_str| {
            let property_type: PropertyType = serde_json::from_str(property_type_str)
                .expect("could not parse property type representation");

            let metadata = PartialPropertyTypeMetadata {
                record_id: property_type.id().clone().into(),
                classification: OntologyTypeClassificationMetadata::Owned {
                    owned_by_id: OwnedById::new(account_id.into_uuid()),
                },
            };

            (property_type, metadata)
        });
        store
            .create_property_types(
                account_id,
                &mut NoAuthorization,
                property_types_iter,
                ConflictBehavior::Skip,
                property_type_relationships(),
            )
            .await?;

        let entity_types_iter = entity_types.into_iter().map(|entity_type_str| {
            let entity_type: EntityType = serde_json::from_str(entity_type_str)
                .expect("could not parse entity type representation");

            let metadata = PartialEntityTypeMetadata {
                record_id: entity_type.id().clone().into(),
                label_property: None,
                icon: None,
                classification: OntologyTypeClassificationMetadata::Owned {
                    owned_by_id: OwnedById::new(account_id.into_uuid()),
                },
            };

            (entity_type, metadata)
        });
        store
            .create_entity_types(
                account_id,
                &mut NoAuthorization,
                entity_types_iter,
                ConflictBehavior::Skip,
                entity_type_relationships(),
            )
            .await?;

        Ok(DatabaseApi { store, account_id })
    }
}

fn generate_decision_time() -> Timestamp<DecisionTime> {
    // We cannot use `Timestamp::now` as the decision time must be before the transaction time. As
    // the transaction is started before the time was recorded, this will always fail.
    Timestamp::from_str(
        &OffsetDateTime::now_utc()
            .checked_sub(Duration::days(1))
            .expect("could not subtract a day from the current time")
            .format(&Iso8601::DEFAULT)
            .expect("could not format date to ISO8601"),
    )
    .expect("could not parse timestamp")
}

// TODO: Add get_all_* methods
impl DatabaseApi<'_> {
    pub async fn create_owned_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<DataTypeMetadata, InsertionError> {
        let metadata = PartialDataTypeMetadata {
            record_id: data_type.id().clone().into(),
            classification: OntologyTypeClassificationMetadata::Owned {
                owned_by_id: OwnedById::new(self.account_id.into_uuid()),
            },
        };

        self.store
            .create_data_type(
                self.account_id,
                &mut NoAuthorization,
                data_type,
                metadata,
                data_type_relationships(),
            )
            .await
    }

    pub async fn create_external_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<DataTypeMetadata, InsertionError> {
        let metadata = PartialDataTypeMetadata {
            record_id: data_type.id().clone().into(),
            classification: OntologyTypeClassificationMetadata::External {
                fetched_at: OffsetDateTime::now_utc(),
            },
        };

        self.store
            .create_data_type(
                self.account_id,
                &mut NoAuthorization,
                data_type,
                metadata,
                data_type_relationships(),
            )
            .await
    }

    pub async fn get_data_type(
        &mut self,
        url: &VersionedUrl,
    ) -> Result<DataTypeWithMetadata, QueryError> {
        Ok(self
            .store
            .get_data_type(
                self.account_id,
                &NoAuthorization,
                &StructuralQuery {
                    filter: Filter::for_versioned_url(url),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(
                            Some(TemporalBound::Unbounded),
                            None,
                        ),
                    },
                    include_drafts: false,
                },
                None,
                None,
            )
            .await?
            .vertices
            .data_types
            .remove(&DataTypeVertexId::from(url.clone()))
            .expect("no data type found"))
    }

    pub async fn update_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<DataTypeMetadata, UpdateError> {
        self.store
            .update_data_type(
                self.account_id,
                &mut NoAuthorization,
                data_type,
                data_type_relationships(),
            )
            .await
    }

    pub async fn create_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<PropertyTypeMetadata, InsertionError> {
        let metadata = PartialPropertyTypeMetadata {
            record_id: property_type.id().clone().into(),
            classification: OntologyTypeClassificationMetadata::Owned {
                owned_by_id: OwnedById::new(self.account_id.into_uuid()),
            },
        };

        self.store
            .create_property_type(
                self.account_id,
                &mut NoAuthorization,
                property_type,
                metadata,
                property_type_relationships(),
            )
            .await
    }

    pub async fn get_property_type(
        &mut self,
        url: &VersionedUrl,
    ) -> Result<PropertyTypeWithMetadata, QueryError> {
        Ok(self
            .store
            .get_property_type(
                self.account_id,
                &NoAuthorization,
                &StructuralQuery {
                    filter: Filter::for_versioned_url(url),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(
                            Some(TemporalBound::Unbounded),
                            None,
                        ),
                    },
                    include_drafts: false,
                },
                None,
                None,
            )
            .await?
            .vertices
            .property_types
            .remove(&PropertyTypeVertexId::from(url.clone()))
            .expect("no property type found"))
    }

    pub async fn update_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<PropertyTypeMetadata, UpdateError> {
        self.store
            .update_property_type(
                self.account_id,
                &mut NoAuthorization,
                property_type,
                property_type_relationships(),
            )
            .await
    }

    pub async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<EntityTypeMetadata, InsertionError> {
        let metadata = PartialEntityTypeMetadata {
            record_id: entity_type.id().clone().into(),
            label_property: None,
            icon: None,
            classification: OntologyTypeClassificationMetadata::Owned {
                owned_by_id: OwnedById::new(self.account_id.into_uuid()),
            },
        };

        self.store
            .create_entity_type(
                self.account_id,
                &mut NoAuthorization,
                entity_type,
                metadata,
                entity_type_relationships(),
            )
            .await
    }

    pub async fn get_entity_type(
        &mut self,
        url: &VersionedUrl,
    ) -> Result<EntityTypeWithMetadata, QueryError> {
        Ok(self
            .store
            .get_entity_type(
                self.account_id,
                &NoAuthorization,
                &StructuralQuery {
                    filter: Filter::for_versioned_url(url),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(
                            Some(TemporalBound::Unbounded),
                            None,
                        ),
                    },
                    include_drafts: false,
                },
                None,
                None,
            )
            .await?
            .vertices
            .entity_types
            .remove(&EntityTypeVertexId::from(url.clone()))
            .expect("no entity type found"))
    }

    pub async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<EntityTypeMetadata, UpdateError> {
        self.store
            .update_entity_type(
                self.account_id,
                &mut NoAuthorization,
                entity_type,
                None,
                None,
                entity_type_relationships(),
            )
            .await
    }

    pub async fn create_entity(
        &mut self,
        properties: EntityProperties,
        entity_type_id: VersionedUrl,
        entity_uuid: Option<EntityUuid>,
    ) -> Result<EntityMetadata, InsertionError> {
        self.store
            .create_entity(
                self.account_id,
                &mut NoAuthorization,
                None,
                OwnedById::new(self.account_id.into_uuid()),
                entity_uuid,
                Some(generate_decision_time()),
                false,
                false,
                entity_type_id,
                properties,
                None,
                [],
            )
            .await
    }

    pub async fn get_entities(&self, entity_id: EntityId) -> Result<Vec<Entity>, QueryError> {
        Ok(self
            .store
            .get_entity(
                self.account_id,
                &NoAuthorization,
                &StructuralQuery {
                    filter: Filter::for_entity_by_entity_id(entity_id),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(
                            Some(TemporalBound::Unbounded),
                            None,
                        ),
                    },
                    include_drafts: false,
                },
                None,
                None,
            )
            .await?
            .0
            .vertices
            .entities
            .into_values()
            .collect())
    }

    pub async fn get_entity_by_timestamp(
        &self,
        entity_id: EntityId,
        timestamp: Timestamp<DecisionTime>,
    ) -> Result<Entity, QueryError> {
        let entities = self
            .store
            .get_entity(
                self.account_id,
                &NoAuthorization,
                &StructuralQuery {
                    filter: Filter::for_entity_by_entity_id(entity_id),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(
                            Some(TemporalBound::Inclusive(timestamp)),
                            Some(LimitedTemporalBound::Inclusive(timestamp)),
                        ),
                    },
                    include_drafts: false,
                },
                None,
                None,
            )
            .await?
            .0
            .vertices
            .entities
            .into_values()
            .collect::<Vec<_>>();
        assert_eq!(entities.len(), 1);
        Ok(entities.into_iter().next().unwrap())
    }

    pub async fn get_latest_entity(&self, entity_id: EntityId) -> Result<Entity, QueryError> {
        let entities = self
            .store
            .get_entity(
                self.account_id,
                &NoAuthorization,
                &StructuralQuery {
                    filter: Filter::for_entity_by_entity_id(entity_id),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    include_drafts: false,
                },
                None,
                None,
            )
            .await?
            .0
            .vertices
            .entities
            .into_values()
            .collect::<Vec<_>>();
        assert_eq!(entities.len(), 1);
        Ok(entities.into_iter().next().unwrap())
    }

    pub async fn update_entity(
        &mut self,
        entity_id: EntityId,
        properties: EntityProperties,
        entity_type_id: VersionedUrl,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        self.store
            .update_entity(
                self.account_id,
                &mut NoAuthorization,
                None,
                entity_id,
                Some(generate_decision_time()),
                false,
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
        entity_type_id: VersionedUrl,
        entity_uuid: Option<EntityUuid>,
        left_entity_id: EntityId,
        right_entity_id: EntityId,
    ) -> Result<EntityMetadata, InsertionError> {
        self.store
            .create_entity(
                self.account_id,
                &mut NoAuthorization,
                None,
                OwnedById::new(self.account_id.into_uuid()),
                entity_uuid,
                None,
                false,
                false,
                entity_type_id,
                properties,
                Some(LinkData {
                    left_entity_id,
                    right_entity_id,
                    order: EntityLinkOrder {
                        left_to_right: None,
                        right_to_left: None,
                    },
                }),
                [],
            )
            .await
    }

    pub async fn get_link_entity_target(
        &self,
        source_entity_id: EntityId,
        link_type_id: VersionedUrl,
    ) -> Result<Entity, QueryError> {
        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::Uuid),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.entity_uuid.into_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::OwnedById),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.owned_by_id.into_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityTypeEdge {
                    edge_kind: SharedEdgeKind::IsOfType,
                    path: EntityTypeQueryPath::BaseUrl,
                    inheritance_depth: Some(0),
                })),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    link_type_id.base_url.as_str(),
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityTypeEdge {
                    edge_kind: SharedEdgeKind::IsOfType,
                    path: EntityTypeQueryPath::Version,
                    inheritance_depth: Some(0),
                })),
                Some(FilterExpression::Parameter(Parameter::OntologyTypeVersion(
                    OntologyTypeVersion::new(link_type_id.version),
                ))),
            ),
        ]);

        let mut subgraph = self
            .store
            .get_entity(
                self.account_id,
                &NoAuthorization,
                &StructuralQuery {
                    filter,
                    graph_resolve_depths: GraphResolveDepths::default(),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(
                            Some(TemporalBound::Unbounded),
                            None,
                        ),
                    },
                    include_drafts: false,
                },
                None,
                None,
            )
            .await?;

        let roots = subgraph
            .0
            .roots
            .into_iter()
            .filter_map(|vertex_id| match vertex_id {
                GraphElementVertexId::KnowledgeGraph(vertex_id) => {
                    subgraph.0.vertices.entities.remove(&vertex_id)
                }
                _ => None,
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
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::Uuid),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.entity_uuid.into_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::OwnedById),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    source_entity_id.owned_by_id.into_uuid(),
                ))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Archived)),
                Some(FilterExpression::Parameter(Parameter::Boolean(false))),
            ),
        ]);

        let mut subgraph = self
            .store
            .get_entity(
                self.account_id,
                &NoAuthorization,
                &StructuralQuery {
                    filter,
                    graph_resolve_depths: GraphResolveDepths::default(),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    include_drafts: false,
                },
                None,
                None,
            )
            .await?;

        Ok(subgraph
            .0
            .roots
            .into_iter()
            .filter_map(|vertex_id| match vertex_id {
                GraphElementVertexId::KnowledgeGraph(edition_id) => {
                    subgraph.0.vertices.entities.remove(&edition_id)
                }
                _ => None,
            })
            .collect())
    }

    async fn archive_entity(
        &mut self,
        entity_id: EntityId,
        properties: EntityProperties,
        entity_type_id: VersionedUrl,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        self.store
            .update_entity(
                self.account_id,
                &mut NoAuthorization,
                None,
                entity_id,
                None,
                true,
                false,
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
