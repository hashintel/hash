use alloc::sync::Arc;
use core::mem;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{
    AuthorizationApi,
    policies::{
        Policy, PolicyId,
        store::{
            CreateWebParameter, CreateWebResponse, PolicyFilter, PolicyStore, PrincipalStore,
            RoleAssignmentStatus, RoleUnassignmentStatus,
            error::{
                EnsureSystemPoliciesError, GetPoliciesError, GetSystemAccountError,
                RoleAssignmentError, WebCreationError,
            },
        },
    },
    schema::{
        DataTypeRelationAndSubject, DataTypeViewerSubject, EntityRelationAndSubject,
        EntityTypeInstantiatorSubject, EntityTypeRelationAndSubject, EntityTypeViewerSubject,
        PropertyTypeRelationAndSubject, PropertyTypeViewerSubject, WebOwnerSubject,
    },
    zanzibar::Consistency,
};
use hash_graph_store::{
    account::{
        AccountGroupInsertionError, AccountInsertionError, AccountStore, CreateAiActorParams,
        CreateMachineActorParams, CreateOrgWebParams, CreateTeamParams, CreateUserActorParams,
        CreateUserActorResponse, GetTeamResponse, GetWebResponse, QueryWebError,
        TeamRetrievalError, WebInsertionError, WebRetrievalError,
    },
    data_type::{
        ArchiveDataTypeParams, CountDataTypesParams, CreateDataTypeParams, DataTypeStore,
        GetDataTypeConversionTargetsParams, GetDataTypeConversionTargetsResponse,
        GetDataTypeSubgraphParams, GetDataTypeSubgraphResponse, GetDataTypesParams,
        GetDataTypesResponse, UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams,
        UpdateDataTypesParams,
    },
    entity::{
        CountEntitiesParams, CreateEntityParams, EntityStore, EntityValidationReport,
        GetEntitiesParams, GetEntitiesResponse, GetEntitySubgraphParams, GetEntitySubgraphResponse,
        PatchEntityParams, UpdateEntityEmbeddingsParams, ValidateEntityParams,
    },
    entity_type::{
        ArchiveEntityTypeParams, CountEntityTypesParams, CreateEntityTypeParams, EntityTypeStore,
        GetClosedMultiEntityTypesResponse, GetEntityTypeSubgraphParams,
        GetEntityTypeSubgraphResponse, GetEntityTypesParams, GetEntityTypesResponse,
        IncludeResolvedEntityTypeOption, UnarchiveEntityTypeParams,
        UpdateEntityTypeEmbeddingParams, UpdateEntityTypesParams,
    },
    error::{InsertionError, QueryError, UpdateError},
    filter::{Filter, QueryRecord},
    pool::StorePool,
    property_type::{
        ArchivePropertyTypeParams, CountPropertyTypesParams, CreatePropertyTypeParams,
        GetPropertyTypeSubgraphParams, GetPropertyTypeSubgraphResponse, GetPropertyTypesParams,
        GetPropertyTypesResponse, PropertyTypeStore, UnarchivePropertyTypeParams,
        UpdatePropertyTypeEmbeddingParams, UpdatePropertyTypesParams,
    },
    query::{ConflictBehavior, QueryResult, Read, ReadPaginated, Sorting},
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxes, QueryTemporalAxesUnresolved,
        VariableTemporalAxisUnresolved,
    },
};
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use hash_graph_types::ontology::{
    PartialDataTypeMetadata, PartialEntityTypeMetadata, PartialPropertyTypeMetadata,
};
use hash_temporal_client::TemporalClient;
use tarpc::context;
use tokio::net::ToSocketAddrs;
use tracing::Instrument as _;
use type_system::{
    knowledge::{
        Entity,
        entity::{EntityId, id::EntityUuid},
    },
    ontology::{
        OntologyTemporalMetadata, OntologyTypeMetadata, OntologyTypeReference, OntologyTypeSchema,
        VersionedUrl,
        data_type::{DataType, DataTypeMetadata},
        entity_type::{EntityType, EntityTypeMetadata, schema::EntityTypeReference},
        json_schema::DomainValidator,
        property_type::{PropertyType, PropertyTypeMetadata},
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{
        actor::{ActorEntityUuid, ActorId, ActorType, AiId, MachineId},
        actor_group::{ActorGroupEntityUuid, TeamId, WebId},
        role::RoleName,
    },
    provenance::{OriginProvenance, OriginType},
};

use crate::fetcher::{FetchedOntologyType, FetcherClient};

pub trait TypeFetcher {
    /// Fetches the provided type reference and inserts it to the Graph.
    fn insert_external_ontology_type(
        &mut self,
        actor_id: ActorEntityUuid,
        reference: OntologyTypeReference<'_>,
    ) -> impl Future<Output = Result<OntologyTypeMetadata, Report<InsertionError>>> + Send;
}

#[derive(Clone)]
struct TypeFetcherConnectionInfo<A> {
    address: A,
    config: tarpc::client::Config,
    domain_validator: DomainValidator,
}

pub struct FetchingPool<P, A> {
    pool: P,
    connection_info: Option<TypeFetcherConnectionInfo<A>>,
}

impl<P, A> FetchingPool<P, A>
where
    A: ToSocketAddrs,
{
    pub fn new(pool: P, address: A, domain_validator: DomainValidator) -> Self {
        Self {
            pool,
            connection_info: Some(TypeFetcherConnectionInfo {
                address,
                config: tarpc::client::Config::default(),
                domain_validator,
            }),
        }
    }

    pub const fn new_offline(pool: P) -> Self {
        Self {
            pool,
            connection_info: None,
        }
    }
}

impl<P, Add> StorePool for FetchingPool<P, Add>
where
    P: StorePool + Send + Sync,
    Add: ToSocketAddrs + Send + Sync + Clone,
{
    type Error = P::Error;
    type Store<'pool, A: AuthorizationApi> = FetchingStore<P::Store<'pool, A>, Add>;

    async fn acquire<A: AuthorizationApi>(
        &self,
        authorization_api: A,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> Result<Self::Store<'_, A>, Report<Self::Error>> {
        Ok(FetchingStore {
            store: self
                .pool
                .acquire(authorization_api, temporal_client)
                .await?,
            connection_info: self.connection_info.clone(),
        })
    }

    async fn acquire_owned<A: AuthorizationApi>(
        &self,
        authorization_api: A,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> Result<Self::Store<'static, A>, Report<Self::Error>> {
        Ok(FetchingStore {
            store: self
                .pool
                .acquire_owned(authorization_api, temporal_client)
                .await?,
            connection_info: self.connection_info.clone(),
        })
    }
}

pub struct FetchingStore<S, A> {
    store: S,
    connection_info: Option<TypeFetcherConnectionInfo<A>>,
}

impl<S, A> PrincipalStore for FetchingStore<S, A>
where
    S: PrincipalStore + Send,
    A: Send,
{
    async fn get_or_create_system_actor(
        &mut self,
        identifier: &str,
    ) -> Result<MachineId, Report<GetSystemAccountError>> {
        self.store.get_or_create_system_actor(identifier).await
    }

    async fn ensure_system_policies(&mut self) -> Result<(), Report<EnsureSystemPoliciesError>> {
        self.store.ensure_system_policies().await
    }

    async fn create_web(
        &mut self,
        actor: ActorId,
        parameter: CreateWebParameter,
    ) -> Result<CreateWebResponse, Report<WebCreationError>> {
        self.store.create_web(actor, parameter).await
    }

    async fn assign_role(
        &mut self,
        actor_id: ActorEntityUuid,
        actor_to_assign: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
        name: RoleName,
    ) -> Result<RoleAssignmentStatus, Report<RoleAssignmentError>> {
        self.store
            .assign_role(actor_id, actor_to_assign, actor_group_id, name)
            .await
    }

    async fn is_assigned(
        &mut self,
        actor_id: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
    ) -> Result<Option<RoleName>, Report<RoleAssignmentError>> {
        self.store.is_assigned(actor_id, actor_group_id).await
    }

    async fn get_role_assignments(
        &mut self,
        actor_group_id: ActorGroupEntityUuid,
        role: RoleName,
    ) -> Result<Vec<ActorEntityUuid>, Report<RoleAssignmentError>> {
        self.store.get_role_assignments(actor_group_id, role).await
    }

    async fn unassign_role(
        &mut self,
        actor_id: ActorEntityUuid,
        actor_to_unassign: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
        name: RoleName,
    ) -> Result<RoleUnassignmentStatus, Report<RoleAssignmentError>> {
        self.store
            .unassign_role(actor_id, actor_to_unassign, actor_group_id, name)
            .await
    }
}

impl<S, A> PolicyStore for FetchingStore<S, A>
where
    S: PolicyStore + Sync,
    A: Send + Sync,
{
    async fn get_policy_by_id(
        &self,
        authenticated_actor: ActorEntityUuid,
        policy_id: PolicyId,
    ) -> Result<Option<Policy>, Report<GetPoliciesError>> {
        self.store
            .get_policy_by_id(authenticated_actor, policy_id)
            .await
    }

    async fn query_policies(
        &self,
        authenticated_actor: ActorEntityUuid,
        filter: &PolicyFilter,
    ) -> Result<Vec<Policy>, Report<GetPoliciesError>> {
        self.store.query_policies(authenticated_actor, filter).await
    }

    async fn resolve_policies_for_actor(
        &self,
        authenticated_actor: ActorEntityUuid,
        actor_id: ActorId,
    ) -> Result<Vec<Policy>, Report<GetPoliciesError>> {
        self.store
            .resolve_policies_for_actor(authenticated_actor, actor_id)
            .await
    }
}

const DATA_TYPE_RELATIONSHIPS: [DataTypeRelationAndSubject; 1] =
    [DataTypeRelationAndSubject::Viewer {
        subject: DataTypeViewerSubject::Public,
        level: 0,
    }];
const PROPERTY_TYPE_RELATIONSHIPS: [PropertyTypeRelationAndSubject; 1] =
    [PropertyTypeRelationAndSubject::Viewer {
        subject: PropertyTypeViewerSubject::Public,
        level: 0,
    }];
const ENTITY_TYPE_RELATIONSHIPS: [EntityTypeRelationAndSubject; 2] = [
    EntityTypeRelationAndSubject::Viewer {
        subject: EntityTypeViewerSubject::Public,
        level: 0,
    },
    EntityTypeRelationAndSubject::Instantiator {
        subject: EntityTypeInstantiatorSubject::Public,
        level: 0,
    },
];

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display, derive_more::Error)]
pub enum FetchingStoreError {
    #[display("type fetcher is not available in offline mode")]
    Offline,
    #[display("could not connect to type fetcher")]
    NoConnection,
}

impl<S, A> FetchingStore<S, A>
where
    S: Sync,
    A: ToSocketAddrs + Send + Sync,
{
    fn connection_info(&self) -> Result<&TypeFetcherConnectionInfo<A>, Report<FetchingStoreError>> {
        self.connection_info
            .as_ref()
            .ok_or_else(|| Report::new(FetchingStoreError::Offline))
    }

    /// Creates the client to fetch types from.
    ///
    /// # Errors
    ///
    /// Returns an error if the type fetcher is not available.
    pub async fn fetcher_client(&self) -> Result<FetcherClient, Report<FetchingStoreError>>
    where
        A: Send + ToSocketAddrs,
    {
        let connection_info = self.connection_info()?;
        let transport = tarpc::serde_transport::tcp::connect(
            &connection_info.address,
            tarpc::tokio_serde::formats::Json::default,
        )
        .await
        .change_context(FetchingStoreError::NoConnection)?;
        Ok(FetcherClient::new(connection_info.config.clone(), transport).spawn())
    }

    pub const fn store(&mut self) -> &mut S {
        &mut self.store
    }
}

#[derive(Default)]
#[expect(
    clippy::struct_field_names,
    reason = "Removing the postfix will be more confusing"
)]
struct FetchedOntologyTypes {
    data_types: Vec<(DataType, PartialDataTypeMetadata)>,
    property_types: Vec<(PropertyType, PartialPropertyTypeMetadata)>,
    entity_types: Vec<(EntityType, PartialEntityTypeMetadata)>,
}

#[derive(Debug)]
enum FetchBehavior {
    IncludeProvidedReferences,
    ExcludeProvidedReferences,
}

impl<S, A> FetchingStore<S, A>
where
    A: ToSocketAddrs + Send + Sync,
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
{
    async fn contains_ontology_type(
        &self,
        actor_id: ActorEntityUuid,
        ontology_type_reference: OntologyTypeReference<'_>,
    ) -> Result<bool, Report<QueryError>> {
        let url = ontology_type_reference.url();

        if let Ok(connection_info) = self.connection_info() {
            if connection_info
                .domain_validator
                .validate_url(url.base_url.as_str())
            {
                // If the domain is valid, we own the data type and it either exists or we cannot
                // reference it.
                return Ok(true);
            }
        }

        match ontology_type_reference {
            OntologyTypeReference::DataTypeReference(_) => self
                .store
                .get_data_types(
                    actor_id,
                    GetDataTypesParams {
                        filter: Filter::for_versioned_url(url),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        after: None,
                        limit: None,
                        include_drafts: true,
                        include_count: false,
                    },
                )
                .await
                .map(|response| !response.data_types.is_empty()),
            OntologyTypeReference::PropertyTypeReference(_) => self
                .store
                .get_property_types(
                    actor_id,
                    GetPropertyTypesParams {
                        filter: Filter::for_versioned_url(url),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        after: None,
                        limit: None,
                        include_drafts: true,
                        include_count: false,
                    },
                )
                .await
                .map(|response| !response.property_types.is_empty()),
            OntologyTypeReference::EntityTypeReference(_) => self
                .store
                .get_entity_types(
                    actor_id,
                    GetEntityTypesParams {
                        filter: Filter::for_versioned_url(url),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        include_drafts: true,
                        after: None,
                        limit: None,
                        include_entity_types: None,
                        include_count: false,
                        include_web_ids: false,
                        include_edition_created_by_ids: false,
                    },
                )
                .await
                .map(|response| !response.entity_types.is_empty()),
        }
        .attach_printable("Could not check if ontology type exists")
    }

    #[tracing::instrument(level = "trace", skip(self, ontology_type))]
    async fn collect_external_ontology_types<'o, T: OntologyTypeSchema + Sync>(
        &self,
        actor_id: ActorEntityUuid,
        ontology_type: &'o T,
        bypassed_types: &HashSet<&VersionedUrl>,
    ) -> Result<Vec<OntologyTypeReference<'o>>, Report<QueryError>> {
        let mut references = Vec::new();
        for reference in ontology_type.references() {
            if !bypassed_types.contains(reference.url())
                && !self
                    .contains_ontology_type(actor_id, reference)
                    .await
                    .change_context(QueryError)?
            {
                references.push(reference);
            }
        }

        Ok(references)
    }

    #[tracing::instrument(level = "debug", skip(self, ontology_type_references))]
    async fn fetch_external_ontology_types(
        &self,
        actor_id: ActorEntityUuid,
        ontology_type_references: impl IntoIterator<Item = VersionedUrl> + Send,
        fetch_behavior: FetchBehavior,
        bypassed_types: &HashSet<&VersionedUrl>,
    ) -> Result<FetchedOntologyTypes, Report<QueryError>> {
        let mut queue = ontology_type_references.into_iter().collect::<Vec<_>>();
        let mut seen = match fetch_behavior {
            FetchBehavior::IncludeProvidedReferences => HashSet::new(),
            FetchBehavior::ExcludeProvidedReferences => {
                queue.iter().cloned().collect::<HashSet<_>>()
            }
        };

        let mut fetched_ontology_types = FetchedOntologyTypes::default();
        if queue.is_empty() {
            return Ok(fetched_ontology_types);
        }

        let fetcher = self
            .fetcher_client()
            .await
            .attach_printable_lazy(|| {
                queue
                    .iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .change_context(QueryError)?;
        loop {
            let ontology_urls = mem::take(&mut queue);
            if ontology_urls.is_empty() {
                break;
            }

            let ontology_types = {
                let span = tracing::info_span!(
                    "fetching ontology types from type fetcher",
                    urls=?ontology_urls
                );
                fetcher
                    .fetch_ontology_types(context::current(), ontology_urls)
                    .instrument(span)
                    .await
                    .change_context(QueryError)?
                    .change_context(QueryError)?
            };

            for (ontology_type, fetched_at) in ontology_types {
                match ontology_type {
                    FetchedOntologyType::DataType(data_type) => {
                        let metadata = PartialDataTypeMetadata {
                            record_id: data_type.id().clone().into(),
                            ownership: OntologyOwnership::Remote { fetched_at },
                        };

                        for referenced_ontology_type in self
                            .collect_external_ontology_types(actor_id, &*data_type, bypassed_types)
                            .await?
                        {
                            if !seen.contains(referenced_ontology_type.url()) {
                                queue.push(referenced_ontology_type.url().clone());
                                seen.insert(referenced_ontology_type.url().clone());
                            }
                        }

                        fetched_ontology_types
                            .data_types
                            .push((*data_type, metadata));
                    }
                    FetchedOntologyType::PropertyType(property_type) => {
                        let metadata = PartialPropertyTypeMetadata {
                            record_id: property_type.id().clone().into(),
                            ownership: OntologyOwnership::Remote { fetched_at },
                        };

                        for referenced_ontology_type in self
                            .collect_external_ontology_types(
                                actor_id,
                                &*property_type,
                                bypassed_types,
                            )
                            .await?
                        {
                            if !seen.contains(referenced_ontology_type.url()) {
                                queue.push(referenced_ontology_type.url().clone());
                                seen.insert(referenced_ontology_type.url().clone());
                            }
                        }

                        fetched_ontology_types
                            .property_types
                            .push((*property_type, metadata));
                    }
                    FetchedOntologyType::EntityType(entity_type) => {
                        let metadata = PartialEntityTypeMetadata {
                            record_id: entity_type.id().clone().into(),
                            ownership: OntologyOwnership::Remote { fetched_at },
                        };

                        for referenced_ontology_type in self
                            .collect_external_ontology_types(
                                actor_id,
                                &*entity_type,
                                bypassed_types,
                            )
                            .await?
                        {
                            if !seen.contains(referenced_ontology_type.url()) {
                                queue.push(referenced_ontology_type.url().clone());
                                seen.insert(referenced_ontology_type.url().clone());
                            }
                        }

                        fetched_ontology_types
                            .entity_types
                            .push((*entity_type, metadata));
                    }
                }
            }
        }

        Ok(fetched_ontology_types)
    }

    #[tracing::instrument(level = "debug", skip(self, ontology_types))]
    async fn insert_external_types<'o, T: OntologyTypeSchema + Sync + 'o>(
        &mut self,
        actor_id: ActorEntityUuid,
        ontology_types: impl IntoIterator<Item = &'o T, IntoIter: Send> + Send,
        bypassed_types: &HashSet<&VersionedUrl>,
    ) -> Result<(), Report<InsertionError>> {
        // Without collecting it first, we get a "Higher-ranked lifetime error" because of the
        // limitations of Rust being able to look into a `Pin<Box<dyn Future>>`, which is returned
        // by `#[async_trait]` methods.
        let ontology_types = ontology_types.into_iter().collect::<Vec<_>>();

        let mut ontology_type_ids = HashSet::new();

        for ontology_type in ontology_types {
            let external_types = self
                .collect_external_ontology_types(actor_id, ontology_type, bypassed_types)
                .await
                .change_context(InsertionError)?;

            ontology_type_ids.extend(
                external_types
                    .into_iter()
                    .map(|ontology_type| ontology_type.url().clone()),
            );
        }

        let fetched_ontology_types = self
            .fetch_external_ontology_types(
                actor_id,
                ontology_type_ids,
                FetchBehavior::ExcludeProvidedReferences,
                bypassed_types,
            )
            .await
            .change_context(InsertionError)?;

        if !fetched_ontology_types.data_types.is_empty() {
            self.store
                .create_data_types(
                    actor_id,
                    fetched_ontology_types
                        .data_types
                        .into_iter()
                        .map(|(schema, metadata)| CreateDataTypeParams {
                            schema,
                            ownership: metadata.ownership,
                            relationships: DATA_TYPE_RELATIONSHIPS,
                            conflict_behavior: ConflictBehavior::Skip,
                            provenance: ProvidedOntologyEditionProvenance {
                                actor_type: ActorType::Machine,
                                origin: OriginProvenance::from_empty_type(OriginType::Api),
                                sources: Vec::new(),
                            },
                            conversions: HashMap::new(),
                        }),
                )
                .await?;
        }

        if !fetched_ontology_types.property_types.is_empty() {
            self.store
                .create_property_types(
                    actor_id,
                    fetched_ontology_types
                        .property_types
                        .into_iter()
                        .map(|(schema, metadata)| CreatePropertyTypeParams {
                            schema,
                            ownership: metadata.ownership,
                            relationships: PROPERTY_TYPE_RELATIONSHIPS,
                            conflict_behavior: ConflictBehavior::Skip,
                            provenance: ProvidedOntologyEditionProvenance {
                                actor_type: ActorType::Machine,
                                origin: OriginProvenance::from_empty_type(OriginType::Api),
                                sources: Vec::new(),
                            },
                        }),
                )
                .await?;
        }

        if !fetched_ontology_types.entity_types.is_empty() {
            self.store
                .create_entity_types(
                    actor_id,
                    fetched_ontology_types
                        .entity_types
                        .into_iter()
                        .map(|(schema, metadata)| CreateEntityTypeParams {
                            schema,
                            ownership: metadata.ownership,
                            relationships: ENTITY_TYPE_RELATIONSHIPS,
                            conflict_behavior: ConflictBehavior::Skip,
                            provenance: ProvidedOntologyEditionProvenance {
                                actor_type: ActorType::Machine,
                                origin: OriginProvenance::from_empty_type(OriginType::Api),
                                sources: Vec::new(),
                            },
                        }),
                )
                .await?;
        }

        Ok(())
    }

    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_external_types_by_reference(
        &mut self,
        actor_id: ActorEntityUuid,
        reference: OntologyTypeReference<'_>,
        on_conflict: ConflictBehavior,
        fetch_behavior: FetchBehavior,
        bypassed_types: &HashSet<&VersionedUrl>,
    ) -> Result<Vec<OntologyTypeMetadata>, Report<InsertionError>> {
        if on_conflict == ConflictBehavior::Fail
            || !self
                .contains_ontology_type(actor_id, reference)
                .await
                .change_context(InsertionError)?
        {
            let fetched_ontology_types = self
                .fetch_external_ontology_types(
                    actor_id,
                    [reference.url().clone()],
                    fetch_behavior,
                    bypassed_types,
                )
                .await
                .change_context(InsertionError)?;

            let created_data_types = if fetched_ontology_types.data_types.is_empty() {
                Vec::new()
            } else {
                self.store
                    .create_data_types(
                        actor_id,
                        fetched_ontology_types
                            .data_types
                            .into_iter()
                            .map(|(schema, metadata)| CreateDataTypeParams {
                                schema,
                                ownership: metadata.ownership,
                                relationships: DATA_TYPE_RELATIONSHIPS,
                                conflict_behavior: ConflictBehavior::Skip,
                                provenance: ProvidedOntologyEditionProvenance {
                                    actor_type: ActorType::Machine,
                                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                                    sources: Vec::new(),
                                },
                                conversions: HashMap::new(),
                            }),
                    )
                    .await?
            };

            let created_property_types = if fetched_ontology_types.property_types.is_empty() {
                Vec::new()
            } else {
                self.store
                    .create_property_types(
                        actor_id,
                        fetched_ontology_types.property_types.into_iter().map(
                            |(schema, metadata)| CreatePropertyTypeParams {
                                schema,
                                ownership: metadata.ownership,
                                relationships: PROPERTY_TYPE_RELATIONSHIPS,
                                conflict_behavior: ConflictBehavior::Skip,
                                provenance: ProvidedOntologyEditionProvenance {
                                    actor_type: ActorType::Machine,
                                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                                    sources: Vec::new(),
                                },
                            },
                        ),
                    )
                    .await?
            };

            let created_entity_types = if fetched_ontology_types.entity_types.is_empty() {
                Vec::new()
            } else {
                self.store
                    .create_entity_types(
                        actor_id,
                        fetched_ontology_types.entity_types.into_iter().map(
                            |(schema, metadata)| CreateEntityTypeParams {
                                schema,
                                ownership: metadata.ownership,
                                relationships: ENTITY_TYPE_RELATIONSHIPS,
                                conflict_behavior: ConflictBehavior::Skip,
                                provenance: ProvidedOntologyEditionProvenance {
                                    actor_type: ActorType::Machine,
                                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                                    sources: Vec::new(),
                                },
                            },
                        ),
                    )
                    .await?
            };

            Ok(created_data_types
                .into_iter()
                .map(OntologyTypeMetadata::DataType)
                .chain(
                    created_property_types
                        .into_iter()
                        .map(OntologyTypeMetadata::PropertyType),
                )
                .chain(
                    created_entity_types
                        .into_iter()
                        .map(OntologyTypeMetadata::EntityType),
                )
                .collect())
        } else {
            Ok(Vec::new())
        }
    }
}

impl<S, A> TypeFetcher for FetchingStore<S, A>
where
    A: ToSocketAddrs + Send + Sync,
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
{
    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_external_ontology_type(
        &mut self,
        actor_id: ActorEntityUuid,
        reference: OntologyTypeReference<'_>,
    ) -> Result<OntologyTypeMetadata, Report<InsertionError>> {
        self.insert_external_types_by_reference(
            actor_id,
            reference,
            ConflictBehavior::Fail,
            FetchBehavior::IncludeProvidedReferences,
            &HashSet::new(),
        )
        .await?
        .into_iter()
        .find(|metadata| {
            let record_id = metadata.record_id();
            let reference = reference.url();
            record_id.base_url == reference.base_url && record_id.version == reference.version
        })
        .ok_or_else(|| {
            Report::new(InsertionError).attach_printable(format!(
                "external type was not fetched: {}",
                reference.url()
            ))
        })
    }
}

impl<I, A, R, S> ReadPaginated<R, S> for FetchingStore<I, A>
where
    A: Send + Sync,
    I: ReadPaginated<R, S> + Send,
    R: QueryRecord,
    S: Sorting + Sync,
{
    type QueryResult = I::QueryResult;
    type ReadPaginatedStream = I::ReadPaginatedStream;

    async fn read_paginated(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        sorting: &S,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<
        (
            Self::ReadPaginatedStream,
            <Self::QueryResult as QueryResult<R, S>>::Indices,
        ),
        Report<QueryError>,
    > {
        self.store
            .read_paginated(filter, temporal_axes, sorting, limit, include_drafts)
            .await
    }
}

impl<S, A, R> Read<R> for FetchingStore<S, A>
where
    A: Send + Sync,
    S: Read<R> + Send,
    R: QueryRecord,
{
    type ReadStream = S::ReadStream;

    async fn read(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Result<Self::ReadStream, Report<QueryError>> {
        self.store.read(filter, temporal_axes, include_drafts).await
    }

    async fn read_one(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Result<R, Report<QueryError>> {
        self.store
            .read_one(filter, temporal_axes, include_drafts)
            .await
    }
}

impl<S, A> AccountStore for FetchingStore<S, A>
where
    S: AccountStore + Send + Sync,
    A: Send + Sync,
{
    async fn create_user_actor(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateUserActorParams,
    ) -> Result<CreateUserActorResponse, Report<AccountInsertionError>> {
        self.store.create_user_actor(actor_id, params).await
    }

    async fn create_machine_actor(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateMachineActorParams,
    ) -> Result<MachineId, Report<AccountInsertionError>> {
        self.store.create_machine_actor(actor_id, params).await
    }

    async fn create_ai_actor(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateAiActorParams,
    ) -> Result<AiId, Report<AccountInsertionError>> {
        self.store.create_ai_actor(actor_id, params).await
    }

    async fn find_web(
        &mut self,
        actor_id: ActorEntityUuid,
        web_id: WebId,
    ) -> Result<Option<GetWebResponse>, Report<WebRetrievalError>> {
        self.store.find_web(actor_id, web_id).await
    }

    async fn find_web_by_shortname(
        &mut self,
        actor_id: ActorEntityUuid,
        shortname: &str,
    ) -> Result<Option<GetWebResponse>, Report<WebRetrievalError>> {
        self.store.find_web_by_shortname(actor_id, shortname).await
    }

    async fn create_org_web(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateOrgWebParams,
    ) -> Result<CreateWebResponse, Report<WebInsertionError>> {
        self.store.create_org_web(actor_id, params).await
    }

    async fn create_team(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateTeamParams,
    ) -> Result<TeamId, Report<AccountGroupInsertionError>> {
        self.store.create_team(actor_id, params).await
    }

    async fn find_team_by_name(
        &mut self,
        actor_id: ActorEntityUuid,
        name: &str,
    ) -> Result<Option<GetTeamResponse>, Report<TeamRetrievalError>> {
        self.store.find_team_by_name(actor_id, name).await
    }

    async fn identify_subject_id(
        &self,
        subject_id: EntityUuid,
    ) -> Result<WebOwnerSubject, Report<QueryWebError>> {
        self.store.identify_subject_id(subject_id).await
    }
}

impl<S, A> DataTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_data_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreateDataTypeParams<R>> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        let creation_parameters = params.into_iter().collect::<Vec<_>>();
        let requested_types = creation_parameters
            .iter()
            .map(|parameters| parameters.schema.id())
            .collect::<HashSet<_>>();

        self.insert_external_types(
            actor_id,
            creation_parameters
                .iter()
                .map(|parameters| &parameters.schema),
            &requested_types,
        )
        .await
        .attach_printable_lazy(|| {
            requested_types
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        })?;

        self.store
            .create_data_types(actor_id, creation_parameters)
            .await
    }

    async fn count_data_types(
        &self,
        actor_id: ActorEntityUuid,
        params: CountDataTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        self.store.count_data_types(actor_id, params).await
    }

    async fn get_data_types(
        &self,
        actor_id: ActorEntityUuid,
        params: GetDataTypesParams<'_>,
    ) -> Result<GetDataTypesResponse, Report<QueryError>> {
        self.store.get_data_types(actor_id, params).await
    }

    async fn get_data_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: GetDataTypeSubgraphParams<'_>,
    ) -> Result<GetDataTypeSubgraphResponse, Report<QueryError>> {
        self.store.get_data_type_subgraph(actor_id, params).await
    }

    async fn update_data_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdateDataTypesParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        let update_parameters = params.into_iter().collect::<Vec<_>>();
        let requested_types = update_parameters
            .iter()
            .map(|parameters| parameters.schema.id())
            .collect::<HashSet<_>>();

        self.insert_external_types(
            actor_id,
            update_parameters
                .iter()
                .map(|parameters| &parameters.schema),
            &requested_types,
        )
        .await
        .change_context(UpdateError)
        .attach_printable_lazy(|| {
            requested_types
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        })?;

        self.store
            .update_data_types(actor_id, update_parameters)
            .await
    }

    async fn archive_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: ArchiveDataTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.archive_data_type(actor_id, params).await
    }

    async fn unarchive_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchiveDataTypeParams,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.unarchive_data_type(actor_id, params).await
    }

    async fn update_data_type_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        self.store
            .update_data_type_embeddings(actor_id, params)
            .await
    }

    async fn get_data_type_conversion_targets(
        &self,
        actor_id: ActorEntityUuid,
        params: GetDataTypeConversionTargetsParams,
    ) -> Result<GetDataTypeConversionTargetsResponse, Report<QueryError>> {
        self.store
            .get_data_type_conversion_targets(actor_id, params)
            .await
    }

    async fn reindex_data_type_cache(&mut self) -> Result<(), Report<UpdateError>> {
        self.store.reindex_data_type_cache().await
    }
}

impl<S, A> PropertyTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_property_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreatePropertyTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        let creation_parameters = params.into_iter().collect::<Vec<_>>();
        let requested_types = creation_parameters
            .iter()
            .map(|parameters| parameters.schema.id())
            .collect::<HashSet<_>>();

        self.insert_external_types(
            actor_id,
            creation_parameters
                .iter()
                .map(|parameters| &parameters.schema),
            &requested_types,
        )
        .await
        .attach_printable_lazy(|| {
            requested_types
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        })?;

        self.store
            .create_property_types(actor_id, creation_parameters)
            .await
    }

    async fn count_property_types(
        &self,
        actor_id: ActorEntityUuid,
        params: CountPropertyTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        self.store.count_property_types(actor_id, params).await
    }

    async fn get_property_types(
        &self,
        actor_id: ActorEntityUuid,
        params: GetPropertyTypesParams<'_>,
    ) -> Result<GetPropertyTypesResponse, Report<QueryError>> {
        self.store.get_property_types(actor_id, params).await
    }

    async fn get_property_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: GetPropertyTypeSubgraphParams<'_>,
    ) -> Result<GetPropertyTypeSubgraphResponse, Report<QueryError>> {
        self.store
            .get_property_type_subgraph(actor_id, params)
            .await
    }

    async fn update_property_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdatePropertyTypesParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        let update_parameters = params.into_iter().collect::<Vec<_>>();
        let requested_types = update_parameters
            .iter()
            .map(|parameters| parameters.schema.id())
            .collect::<HashSet<_>>();

        self.insert_external_types(
            actor_id,
            update_parameters
                .iter()
                .map(|parameters| &parameters.schema),
            &requested_types,
        )
        .await
        .change_context(UpdateError)
        .attach_printable_lazy(|| {
            requested_types
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        })?;

        self.store
            .update_property_types(actor_id, update_parameters)
            .await
    }

    async fn archive_property_type(
        &mut self,
        actor_id: ActorEntityUuid,

        params: ArchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.archive_property_type(actor_id, params).await
    }

    async fn unarchive_property_type(
        &mut self,
        actor_id: ActorEntityUuid,

        params: UnarchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.unarchive_property_type(actor_id, params).await
    }

    async fn update_property_type_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,

        params: UpdatePropertyTypeEmbeddingParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        self.store
            .update_property_type_embeddings(actor_id, params)
            .await
    }
}

impl<S, A> EntityTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_entity_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreateEntityTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        let creation_parameters = params.into_iter().collect::<Vec<_>>();
        let requested_types = creation_parameters
            .iter()
            .map(|parameters| parameters.schema.id())
            .collect::<HashSet<_>>();

        self.insert_external_types(
            actor_id,
            creation_parameters
                .iter()
                .map(|parameters| &parameters.schema),
            &requested_types,
        )
        .await
        .attach_printable_lazy(|| {
            requested_types
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        })?;

        self.store
            .create_entity_types(actor_id, creation_parameters)
            .await
    }

    async fn count_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        params: CountEntityTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        self.store.count_entity_types(actor_id, params).await
    }

    async fn get_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        params: GetEntityTypesParams<'_>,
    ) -> Result<GetEntityTypesResponse, Report<QueryError>> {
        self.store.get_entity_types(actor_id, params).await
    }

    async fn get_closed_multi_entity_types<I, J>(
        &self,
        actor_id: ActorEntityUuid,
        entity_type_ids: I,
        temporal_axes: QueryTemporalAxesUnresolved,
        include_resolved: Option<IncludeResolvedEntityTypeOption>,
    ) -> Result<GetClosedMultiEntityTypesResponse, Report<QueryError>>
    where
        I: IntoIterator<Item = J> + Send,
        J: IntoIterator<Item = VersionedUrl> + Send,
    {
        self.store
            .get_closed_multi_entity_types(
                actor_id,
                entity_type_ids,
                temporal_axes,
                include_resolved,
            )
            .await
    }

    async fn get_entity_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: GetEntityTypeSubgraphParams<'_>,
    ) -> Result<GetEntityTypeSubgraphResponse, Report<QueryError>> {
        self.store.get_entity_type_subgraph(actor_id, params).await
    }

    async fn update_entity_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdateEntityTypesParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        let update_parameters = params.into_iter().collect::<Vec<_>>();
        let requested_types = update_parameters
            .iter()
            .map(|parameters| parameters.schema.id())
            .collect::<HashSet<_>>();

        self.insert_external_types(
            actor_id,
            update_parameters
                .iter()
                .map(|parameters| &parameters.schema),
            &requested_types,
        )
        .await
        .change_context(UpdateError)
        .attach_printable_lazy(|| {
            requested_types
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        })?;

        self.store
            .update_entity_types(actor_id, update_parameters)
            .await
    }

    async fn archive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,

        params: ArchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.archive_entity_type(actor_id, params).await
    }

    async fn unarchive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,

        params: UnarchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.unarchive_entity_type(actor_id, params).await
    }

    async fn update_entity_type_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,

        params: UpdateEntityTypeEmbeddingParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        self.store
            .update_entity_type_embeddings(actor_id, params)
            .await
    }

    async fn reindex_entity_type_cache(&mut self) -> Result<(), Report<UpdateError>> {
        self.store.reindex_entity_type_cache().await
    }
}

impl<S, A> EntityStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + EntityStore + Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_entities<R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: Vec<CreateEntityParams<R>>,
    ) -> Result<Vec<Entity>, Report<InsertionError>>
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send,
    {
        let type_ids = params
            .iter()
            .flat_map(|params| &params.entity_type_ids)
            .collect::<HashSet<_>>();

        for entity_type_id in type_ids {
            let entity_type_reference = EntityTypeReference {
                url: entity_type_id.clone(),
            };
            self.insert_external_types_by_reference(
                actor_id,
                OntologyTypeReference::EntityTypeReference(&entity_type_reference),
                ConflictBehavior::Skip,
                FetchBehavior::ExcludeProvidedReferences,
                &HashSet::new(),
            )
            .await?;
        }

        self.store.create_entities(actor_id, params).await
    }

    async fn validate_entities(
        &self,
        actor_id: ActorEntityUuid,
        consistency: Consistency<'_>,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> HashMap<usize, EntityValidationReport> {
        self.store
            .validate_entities(actor_id, consistency, params)
            .await
    }

    async fn get_entities(
        &self,
        actor_id: ActorEntityUuid,
        params: GetEntitiesParams<'_>,
    ) -> Result<GetEntitiesResponse<'static>, Report<QueryError>> {
        self.store.get_entities(actor_id, params).await
    }

    async fn get_entity_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: GetEntitySubgraphParams<'_>,
    ) -> Result<GetEntitySubgraphResponse<'static>, Report<QueryError>> {
        self.store.get_entity_subgraph(actor_id, params).await
    }

    async fn get_entity_by_id(
        &self,
        actor_id: ActorEntityUuid,
        entity_id: EntityId,
        transaction_time: Option<Timestamp<TransactionTime>>,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> Result<Entity, Report<QueryError>> {
        self.store
            .get_entity_by_id(actor_id, entity_id, transaction_time, decision_time)
            .await
    }

    async fn count_entities(
        &self,
        actor_id: ActorEntityUuid,
        params: CountEntitiesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        self.store.count_entities(actor_id, params).await
    }

    async fn patch_entity(
        &mut self,
        actor_id: ActorEntityUuid,
        params: PatchEntityParams,
    ) -> Result<Entity, Report<UpdateError>> {
        for entity_type_id in &params.entity_type_ids {
            self.insert_external_types_by_reference(
                actor_id,
                OntologyTypeReference::EntityTypeReference(&EntityTypeReference {
                    url: entity_type_id.clone(),
                }),
                ConflictBehavior::Skip,
                FetchBehavior::ExcludeProvidedReferences,
                &HashSet::new(),
            )
            .await
            .change_context(UpdateError)?;
        }

        self.store.patch_entity(actor_id, params).await
    }

    async fn update_entity_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdateEntityEmbeddingsParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        self.store.update_entity_embeddings(actor_id, params).await
    }

    async fn reindex_entity_cache(&mut self) -> Result<(), Report<UpdateError>> {
        self.store.reindex_entity_cache().await
    }
}
