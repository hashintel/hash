#![feature(lint_reasons)]
#![allow(
    clippy::missing_panics_doc,
    clippy::missing_errors_doc,
    clippy::unwrap_used
)]
#![expect(
    clippy::significant_drop_tightening,
    reason = "This should be enabled but it's currently too noisy"
)]

mod data_type;
mod drafts;
mod entity;
mod entity_type;
mod links;
mod multi_type;
mod partial_updates;
mod property_metadata;
mod property_type;
mod sorting;

use std::{borrow::Cow, str::FromStr};

use authorization::{
    schema::{
        DataTypeRelationAndSubject, DataTypeViewerSubject, EntityTypeInstantiatorSubject,
        EntityTypeRelationAndSubject, EntityTypeSetting, EntityTypeSettingSubject,
        EntityTypeViewerSubject, PropertyTypeRelationAndSubject, PropertyTypeSetting,
        PropertyTypeSettingSubject, PropertyTypeViewerSubject, WebOwnerSubject,
    },
    AuthorizationApi, NoAuthorization,
};
use error_stack::{Report, Result};
use graph::{
    knowledge::EntityQueryPath,
    load_env,
    ontology::EntityTypeQueryPath,
    store::{
        account::{InsertAccountIdParams, InsertWebIdParams},
        knowledge::{CreateEntityParams, GetEntityParams, PatchEntityParams},
        ontology::{
            ArchiveDataTypeParams, ArchiveEntityTypeParams, ArchivePropertyTypeParams,
            CreateDataTypeParams, CreateEntityTypeParams, CreatePropertyTypeParams,
            GetDataTypesParams, GetEntityTypesParams, GetPropertyTypesParams,
            UnarchiveDataTypeParams, UnarchiveEntityTypeParams, UnarchivePropertyTypeParams,
            UpdateDataTypeEmbeddingParams, UpdateDataTypesParams, UpdateEntityTypeEmbeddingParams,
            UpdateEntityTypesParams, UpdatePropertyTypeEmbeddingParams, UpdatePropertyTypesParams,
        },
        query::{Filter, FilterExpression, Parameter},
        AccountStore, ConflictBehavior, DataTypeStore, DatabaseConnectionInfo, DatabaseType,
        EntityQueryCursor, EntityQuerySorting, EntityStore, EntityTypeStore, InsertionError,
        PostgresStore, PostgresStorePool, PropertyTypeStore, QueryError, StorePool, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::GraphElementVertexId,
        query::StructuralQuery,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
        Subgraph,
    },
    Environment,
};
use graph_types::{
    account::AccountId,
    knowledge::{
        entity::{Entity, EntityId, EntityMetadata, EntityUuid, ProvidedEntityEditionProvenance},
        link::LinkData,
        Confidence, PropertyMetadataMap, PropertyObject, PropertyProvenance,
    },
    ontology::{
        DataTypeMetadata, EntityTypeMetadata, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, PropertyTypeMetadata,
        ProvidedOntologyEditionProvenance,
    },
    owned_by_id::OwnedById,
};
use temporal_versioning::{DecisionTime, LimitedTemporalBound, TemporalBound, Timestamp};
use time::{format_description::well_known::Iso8601, Duration, OffsetDateTime};
use tokio_postgres::{NoTls, Transaction};
use type_system::{url::VersionedUrl, DataType, EntityType, PropertyType};
use uuid::Uuid;

pub struct DatabaseTestWrapper<A: AuthorizationApi> {
    _pool: PostgresStorePool<NoTls>,
    connection: <PostgresStorePool<NoTls> as StorePool>::Store<'static, A>,
}

pub struct DatabaseApi<'pool, A: AuthorizationApi> {
    store: PostgresStore<Transaction<'pool>, A>,
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

impl DatabaseTestWrapper<NoAuthorization> {
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
            .acquire_owned(NoAuthorization, None)
            .await
            .expect("could not acquire a database connection");

        Self {
            _pool: pool,
            connection,
        }
    }
}

impl<A: AuthorizationApi> DatabaseTestWrapper<A> {
    pub async fn seed<D, P, E>(
        &mut self,
        data_types: D,
        property_types: P,
        entity_types: E,
    ) -> Result<DatabaseApi<'_, &mut A>, InsertionError>
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
            .insert_account_id(account_id, InsertAccountIdParams { account_id })
            .await
            .expect("could not insert account id");
        store
            .insert_web_id(
                account_id,
                InsertWebIdParams {
                    owned_by_id: OwnedById::new(account_id.into_uuid()),
                    owner: WebOwnerSubject::Account { id: account_id },
                },
            )
            .await
            .expect("could not create web id");

        store
            .create_data_types(
                account_id,
                data_types.into_iter().map(|data_type_str| {
                    let schema: DataType = serde_json::from_str(data_type_str)
                        .expect("could not parse data type representation");
                    CreateDataTypeParams {
                        schema,
                        classification: OntologyTypeClassificationMetadata::Owned {
                            owned_by_id: OwnedById::new(account_id.into_uuid()),
                        },
                        relationships: data_type_relationships(),
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ProvidedOntologyEditionProvenance::default(),
                    }
                }),
            )
            .await?;

        store
            .create_property_types(
                account_id,
                property_types.into_iter().map(|property_type_str| {
                    let schema: PropertyType = serde_json::from_str(property_type_str)
                        .expect("could not property data type representation");
                    CreatePropertyTypeParams {
                        schema,
                        classification: OntologyTypeClassificationMetadata::Owned {
                            owned_by_id: OwnedById::new(account_id.into_uuid()),
                        },
                        relationships: property_type_relationships(),
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ProvidedOntologyEditionProvenance::default(),
                    }
                }),
            )
            .await?;

        store
            .create_entity_types(
                account_id,
                entity_types.into_iter().map(|entity_type_str| {
                    let schema: EntityType = serde_json::from_str(entity_type_str)
                        .expect("could not entity data type representation");
                    CreateEntityTypeParams {
                        schema,
                        classification: OntologyTypeClassificationMetadata::Owned {
                            owned_by_id: OwnedById::new(account_id.into_uuid()),
                        },
                        label_property: None,
                        icon: None,
                        relationships: entity_type_relationships(),
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ProvidedOntologyEditionProvenance::default(),
                    }
                }),
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

impl<A: AuthorizationApi> DataTypeStore for DatabaseApi<'_, A> {
    async fn create_data_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreateDataTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        self.store.create_data_types(actor_id, params).await
    }

    async fn get_data_type(
        &self,
        actor_id: AccountId,
        params: GetDataTypesParams<'_>,
    ) -> Result<Subgraph, QueryError> {
        self.store.get_data_type(actor_id, params).await
    }

    async fn update_data_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdateDataTypesParams<R>,
    ) -> Result<DataTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        self.store.update_data_type(actor_id, params).await
    }

    async fn archive_data_type(
        &mut self,
        actor_id: AccountId,
        params: ArchiveDataTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.archive_data_type(actor_id, params).await
    }

    async fn unarchive_data_type(
        &mut self,
        actor_id: AccountId,
        params: UnarchiveDataTypeParams,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.unarchive_data_type(actor_id, params).await
    }

    async fn update_data_type_embeddings(
        &mut self,
        actor_id: AccountId,
        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        self.store
            .update_data_type_embeddings(actor_id, params)
            .await
    }
}

impl<A: AuthorizationApi> PropertyTypeStore for DatabaseApi<'_, A> {
    async fn create_property_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreatePropertyTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        self.store.create_property_types(actor_id, params).await
    }

    async fn get_property_type(
        &self,
        actor_id: AccountId,
        params: GetPropertyTypesParams<'_>,
    ) -> Result<Subgraph, QueryError> {
        self.store.get_property_type(actor_id, params).await
    }

    async fn update_property_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdatePropertyTypesParams<R>,
    ) -> Result<PropertyTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        self.store.update_property_type(actor_id, params).await
    }

    async fn archive_property_type(
        &mut self,
        actor_id: AccountId,
        params: ArchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.archive_property_type(actor_id, params).await
    }

    async fn unarchive_property_type(
        &mut self,
        actor_id: AccountId,
        params: UnarchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.unarchive_property_type(actor_id, params).await
    }

    async fn update_property_type_embeddings(
        &mut self,
        actor_id: AccountId,
        params: UpdatePropertyTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        self.store
            .update_property_type_embeddings(actor_id, params)
            .await
    }
}

impl<A: AuthorizationApi> EntityTypeStore for DatabaseApi<'_, A> {
    async fn create_entity_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreateEntityTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        self.store.create_entity_types(actor_id, params).await
    }

    async fn get_entity_type(
        &self,
        actor_id: AccountId,
        params: GetEntityTypesParams<'_>,
    ) -> Result<Subgraph, QueryError> {
        self.store.get_entity_type(actor_id, params).await
    }

    async fn update_entity_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdateEntityTypesParams<R>,
    ) -> Result<EntityTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        self.store.update_entity_type(actor_id, params).await
    }

    async fn archive_entity_type(
        &mut self,
        actor_id: AccountId,
        params: ArchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.archive_entity_type(actor_id, params).await
    }

    async fn unarchive_entity_type(
        &mut self,
        actor_id: AccountId,
        params: UnarchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.unarchive_entity_type(actor_id, params).await
    }

    async fn update_entity_type_embeddings(
        &mut self,
        actor_id: AccountId,
        params: UpdateEntityTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        self.store
            .update_entity_type_embeddings(actor_id, params)
            .await
    }
}

impl<A: AuthorizationApi> DatabaseApi<'_, A> {
    pub async fn create_entity(
        &mut self,
        properties: PropertyObject,
        entity_type_ids: Vec<VersionedUrl>,
        entity_uuid: Option<EntityUuid>,
        draft: bool,
        confidence: Option<Confidence>,
        property_metadata: PropertyMetadataMap<'static>,
    ) -> Result<EntityMetadata, InsertionError> {
        self.store
            .create_entity(
                self.account_id,
                CreateEntityParams {
                    owned_by_id: OwnedById::new(self.account_id.into_uuid()),
                    entity_uuid,
                    decision_time: Some(generate_decision_time()),
                    entity_type_ids,
                    properties,
                    property_metadata,
                    link_data: None,
                    draft,
                    relationships: [],
                    confidence,
                    provenance: ProvidedEntityEditionProvenance::default(),
                },
            )
            .await
    }

    pub async fn get_entities(&self, entity_id: EntityId) -> Result<Vec<Entity>, QueryError> {
        let query = StructuralQuery {
            filter: Filter::for_entity_by_entity_id(entity_id),
            graph_resolve_depths: GraphResolveDepths::default(),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
            },
            include_drafts: false,
        };
        let count = self
            .store
            .count_entities(self.account_id, query.clone())
            .await?;
        let response = self
            .store
            .get_entity(
                self.account_id,
                GetEntityParams {
                    query,
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    limit: None,
                    include_count: true,
                },
            )
            .await?;
        assert_eq!(count, response.subgraph.roots.len());
        assert_eq!(response.count, Some(count));
        Ok(response.subgraph.vertices.entities.into_values().collect())
    }

    pub async fn get_all_entities(
        &self,
        limit: usize,
        sorting: EntityQuerySorting<'static>,
    ) -> Result<(Vec<Entity>, Option<EntityQueryCursor<'static>>), QueryError> {
        let mut response = self
            .store
            .get_entity(
                self.account_id,
                GetEntityParams {
                    query: StructuralQuery {
                        filter: Filter::All(Vec::new()),
                        graph_resolve_depths: GraphResolveDepths::default(),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        include_drafts: false,
                    },
                    sorting,
                    limit: Some(limit),
                    include_count: false,
                },
            )
            .await?;
        let entities = response
            .subgraph
            .roots
            .into_iter()
            .filter_map(|vertex_id| {
                let GraphElementVertexId::KnowledgeGraph(vertex_id) = vertex_id else {
                    panic!("unexpected vertex id found: {vertex_id:?}");
                };
                response.subgraph.vertices.entities.remove(&vertex_id)
            })
            .collect();
        Ok((entities, response.cursor))
    }

    pub async fn get_entities_by_type(
        &self,
        entity_type_id: &VersionedUrl,
    ) -> Result<Vec<Entity>, QueryError> {
        let query = StructuralQuery {
            filter: Filter::All(vec![
                Filter::Equal(
                    Some(FilterExpression::Path(EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::BaseUrl,
                        inheritance_depth: Some(0),
                    })),
                    Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                        entity_type_id.base_url.as_str(),
                    )))),
                ),
                Filter::Equal(
                    Some(FilterExpression::Path(EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::Version,
                        inheritance_depth: Some(0),
                    })),
                    Some(FilterExpression::Parameter(Parameter::OntologyTypeVersion(
                        entity_type_id.version,
                    ))),
                ),
            ]),
            graph_resolve_depths: GraphResolveDepths::default(),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            },
            include_drafts: false,
        };

        let count = self
            .store
            .count_entities(self.account_id, query.clone())
            .await?;
        let mut response = self
            .store
            .get_entity(
                self.account_id,
                GetEntityParams {
                    query,
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    limit: None,
                    include_count: true,
                },
            )
            .await?;
        assert_eq!(count, response.subgraph.roots.len());
        assert_eq!(response.count, Some(count));

        Ok(response
            .subgraph
            .roots
            .into_iter()
            .filter_map(|vertex_id| {
                let GraphElementVertexId::KnowledgeGraph(vertex_id) = vertex_id else {
                    panic!("unexpected vertex id found: {vertex_id:?}");
                };
                response.subgraph.vertices.entities.remove(&vertex_id)
            })
            .collect())
    }

    pub async fn get_entity_by_timestamp(
        &self,
        entity_id: EntityId,
        timestamp: Timestamp<DecisionTime>,
    ) -> Result<Entity, QueryError> {
        let response = self
            .store
            .get_entity(
                self.account_id,
                GetEntityParams {
                    query: StructuralQuery {
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
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    limit: None,
                    include_count: true,
                },
            )
            .await?;
        let entities = response
            .subgraph
            .vertices
            .entities
            .into_values()
            .collect::<Vec<_>>();
        assert_eq!(entities.len(), 1);
        assert_eq!(response.count, Some(1));

        Ok(entities.into_iter().next().unwrap())
    }

    pub async fn get_latest_entity(&self, entity_id: EntityId) -> Result<Entity, QueryError> {
        let entities = self
            .store
            .get_entity(
                self.account_id,
                GetEntityParams {
                    query: StructuralQuery {
                        filter: Filter::for_entity_by_entity_id(entity_id),
                        graph_resolve_depths: GraphResolveDepths::default(),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        include_drafts: entity_id.draft_id.is_some(),
                    },
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    limit: None,
                    include_count: false,
                },
            )
            .await?
            .subgraph
            .vertices
            .entities
            .into_values()
            .collect::<Vec<_>>();
        if entities.len() == 1 {
            Ok(entities.into_iter().next().unwrap())
        } else {
            Err(Report::new(QueryError).attach_printable(format!(
                "unexpected number of entities found, expected 1 but received {}",
                entities.len()
            )))
        }
    }

    pub async fn patch_entity(
        &mut self,
        mut params: PatchEntityParams,
    ) -> Result<EntityMetadata, UpdateError> {
        if params.decision_time.is_none() {
            params.decision_time = Some(generate_decision_time());
        }
        self.store.patch_entity(self.account_id, params).await
    }

    async fn create_link_entity(
        &mut self,
        properties: PropertyObject,
        entity_type_ids: Vec<VersionedUrl>,
        entity_uuid: Option<EntityUuid>,
        left_entity_id: EntityId,
        right_entity_id: EntityId,
    ) -> Result<EntityMetadata, InsertionError> {
        self.store
            .create_entity(
                self.account_id,
                CreateEntityParams {
                    owned_by_id: OwnedById::new(self.account_id.into_uuid()),
                    entity_uuid,
                    decision_time: Some(generate_decision_time()),
                    entity_type_ids,
                    properties,
                    property_metadata: PropertyMetadataMap::default(),
                    link_data: Some(LinkData {
                        left_entity_id,
                        right_entity_id,
                        left_entity_confidence: None,
                        left_entity_provenance: PropertyProvenance::default(),
                        right_entity_confidence: None,
                        right_entity_provenance: PropertyProvenance::default(),
                    }),
                    draft: false,
                    relationships: [],
                    confidence: None,
                    provenance: ProvidedEntityEditionProvenance::default(),
                },
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
                    link_type_id.version,
                ))),
            ),
        ]);

        let mut response = self
            .store
            .get_entity(
                self.account_id,
                GetEntityParams {
                    query: StructuralQuery {
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
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    limit: None,
                    include_count: false,
                },
            )
            .await?;

        let roots = response
            .subgraph
            .roots
            .into_iter()
            .filter_map(|vertex_id| match vertex_id {
                GraphElementVertexId::KnowledgeGraph(vertex_id) => {
                    response.subgraph.vertices.entities.remove(&vertex_id)
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

        let mut response = self
            .store
            .get_entity(
                self.account_id,
                GetEntityParams {
                    query: StructuralQuery {
                        filter,
                        graph_resolve_depths: GraphResolveDepths::default(),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        include_drafts: false,
                    },
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    limit: None,
                    include_count: false,
                },
            )
            .await?;

        Ok(response
            .subgraph
            .roots
            .into_iter()
            .filter_map(|vertex_id| match vertex_id {
                GraphElementVertexId::KnowledgeGraph(edition_id) => {
                    response.subgraph.vertices.entities.remove(&edition_id)
                }
                _ => None,
            })
            .collect())
    }

    async fn archive_entity(&mut self, entity_id: EntityId) -> Result<EntityMetadata, UpdateError> {
        self.store
            .patch_entity(
                self.account_id,
                PatchEntityParams {
                    entity_id,
                    decision_time: Some(generate_decision_time()),
                    archived: Some(true),
                    draft: None,
                    entity_type_ids: vec![],
                    properties: vec![],
                    confidence: None,
                    provenance: ProvidedEntityEditionProvenance::default(),
                },
            )
            .await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
