mod crud;
mod knowledge;
mod migration;
mod ontology;
mod pool;
pub(crate) mod query;
mod traversal_context;

use alloc::sync::Arc;
use core::{fmt::Debug, hash::Hash};
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    policies::{
        Authorized, PartialResourceId, PolicySet, Request, RequestContext,
        action::ActionName,
        store::{
            CreateWebParameter, PrincipalStore, RoleAssignmentStatus, RoleUnassignmentStatus,
            error::{GetSystemAccountError, RoleAssignmentError, WebCreationError},
        },
    },
    schema::{
        AccountGroupAdministratorSubject, AccountGroupMemberSubject, AccountGroupPermission,
        AccountGroupRelationAndSubject, WebDataTypeViewerSubject, WebEntityCreatorSubject,
        WebEntityEditorSubject, WebEntityTypeViewerSubject, WebOwnerSubject,
        WebPropertyTypeViewerSubject, WebRelationAndSubject, WebSubjectSet,
    },
    zanzibar::Consistency,
};
use hash_graph_store::{
    account::{
        AccountGroupInsertionError, AccountInsertionError, AccountStore,
        InsertAccountGroupIdParams, InsertAccountIdParams, InsertWebIdParams, QueryWebError,
        WebInsertionError,
    },
    error::{InsertionError, QueryError, UpdateError},
    query::ConflictBehavior,
};
use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, Timestamp, TransactionTime};
use hash_status::StatusCode;
use hash_temporal_client::TemporalClient;
use postgres_types::{Json, ToSql};
use time::OffsetDateTime;
use tokio_postgres::{GenericClient as _, error::SqlState};
use type_system::{
    Valid,
    knowledge::entity::id::EntityUuid,
    ontology::{
        OntologyTemporalMetadata,
        data_type::{
            ClosedDataType, Conversions, DataType, DataTypeUuid,
            schema::{DataTypeReference, DataTypeResolveData},
        },
        entity_type::{
            ClosedEntityType, EntityType, EntityTypeUuid,
            schema::{EntityTypeReference, EntityTypeResolveData},
        },
        id::{BaseUrl, OntologyTypeUuid, OntologyTypeVersion, VersionedUrl},
        property_type::{PropertyType, schema::PropertyTypeReference},
        provenance::{OntologyEditionProvenance, OntologyOwnership, OntologyProvenance},
    },
    principal::{
        actor::{ActorEntityUuid, ActorId, ActorType, MachineId},
        actor_group::{ActorGroupEntityUuid, WebId},
        role::RoleName,
    },
};
use uuid::Uuid;

pub use self::{
    pool::{AsClient, PostgresStorePool},
    traversal_context::TraversalContext,
};
use crate::store::error::{
    BaseUrlAlreadyExists, DeletionError, OntologyTypeIsNotOwned, OntologyVersionDoesNotExist,
    StoreError, VersionedUrlAlreadyExists,
};

#[derive(Debug, Clone)]
pub struct PostgresStoreSettings {
    pub validate_links: bool,
}

impl Default for PostgresStoreSettings {
    fn default() -> Self {
        Self {
            validate_links: true,
        }
    }
}

/// A Postgres-backed store
pub struct PostgresStore<C, A> {
    client: C,
    pub authorization_api: A,
    pub temporal_client: Option<Arc<TemporalClient>>,
    pub settings: PostgresStoreSettings,
}

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: Send + Sync,
{
    async fn search_existing_system_account(
        &self,
    ) -> Result<Option<MachineId>, Report<GetSystemAccountError>> {
        let machine = self
            .as_client()
            .query_opt(
                "
                SELECT base_url, version, lower(transaction_time), CAST(provenance->>'createdById' AS UUID)
                FROM ontology_temporal_metadata
                JOIN ontology_ids ON ontology_temporal_metadata.ontology_id = ontology_ids.ontology_id
                ORDER BY transaction_time ASC
                LIMIT 1;
                ",
                &[],
            )
            .await
            .change_context(GetSystemAccountError::StoreError)?
            .map(|row| {
                let ontology_type_id = VersionedUrl {
                    base_url: row.get(0),
                    version: row.get(1),
                };
                let transaction_time: Timestamp<TransactionTime> = row.get(2);
                let system_account : MachineId = row.get(3);
                tracing::info!(
                    %system_account,
                    "Found system account using ontology type `{ontology_type_id}` created at {transaction_time}"
                );
                system_account
            });
        if let Some(machine) = machine {
            return Ok(Some(machine));
        }

        // We have not identified the machine, yet. We can check if there are more than one machine.
        // If there is only one machine, it is the system account because it is the only machine
        // which could create new machines.
        let machines = self
            .as_client()
            .query_raw(
                "SELECT account_id FROM accounts LIMIT 2",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(GetSystemAccountError::StoreError)?
            .map_ok(|row| row.get::<_, MachineId>(0))
            .try_collect::<Vec<_>>()
            .await
            .change_context(GetSystemAccountError::StoreError)?;

        if machines.len() == 1 {
            tracing::info!(
                system_account = %machines[0],
                "Found system account due to only one machine"
            );
            return Ok(Some(machines[0]));
        }

        Ok(None)
    }
}
impl<C, A> PrincipalStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi + Send + Sync,
{
    async fn get_or_create_system_account(
        &mut self,
    ) -> Result<MachineId, Report<GetSystemAccountError>> {
        let machine_id = if let Some(machine) = self.search_existing_system_account().await? {
            machine
        } else {
            // TODO: Create an actual machine once we have proper machine management in the
            // database.
            // let machine_id = self.create_machine(None)
            //     .await
            //     .change_context(GetSystemAccountError::CreateSystemAccountFailed)?

            // Use the public NIL UUID as actor here as we don't have a valid one, yet.
            let machine_id = ActorEntityUuid::new(Uuid::new_v4());
            self.insert_account_id(
                ActorEntityUuid::new(Uuid::nil()),
                InsertAccountIdParams {
                    account_type: ActorType::Machine,
                    account_id: machine_id,
                },
            )
            .await
            .change_context(GetSystemAccountError::CreateSystemAccountFailed)?;

            tracing::info!(
                system_account = %machine_id,
                "Created new system account"
            );

            MachineId::new(machine_id)
        };

        Ok(machine_id)
    }

    async fn create_web(
        &mut self,
        actor: ActorId,
        parameter: CreateWebParameter,
    ) -> Result<WebId, Report<WebCreationError>> {
        let context = self
            .build_principal_context(actor)
            .await
            .change_context(WebCreationError::StoreError)?;
        let policies = self
            .get_policies_for_actor(actor)
            .await
            .change_context(WebCreationError::StoreError)?;

        let web_id = WebId::new(parameter.id.unwrap_or_else(Uuid::new_v4));

        let policy_set = PolicySet::default()
            .with_policies(policies.values())
            .change_context(WebCreationError::StoreError)?;
        match policy_set
            .evaluate(
                &Request {
                    actor,
                    action: ActionName::CreateWeb,
                    resource: Some(&PartialResourceId::Web(Some(web_id))),
                    context: RequestContext::default(),
                },
                &context,
            )
            .change_context(WebCreationError::StoreError)?
        {
            Authorized::Always => {}
            Authorized::Never => {
                return Err(Report::new(WebCreationError::NotAuthorized))
                    .attach_printable(StatusCode::PermissionDenied);
            }
            Authorized::Partial(_) => {
                unimplemented!("Web creation is not supported for partial authorization");
            }
        }

        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO web (id) VALUES ($1)", &[&web_id])
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(WebCreationError::AlreadyExists { web_id })
            } else {
                Err(error).change_context(WebCreationError::StoreError)
            };
        }

        Ok(web_id)
    }

    async fn assign_role(
        &mut self,
        actor: ActorEntityUuid,
        actor_to_assign: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
        name: RoleName,
    ) -> Result<RoleAssignmentStatus, Report<RoleAssignmentError>> {
        let mut transaction = self
            .transaction()
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        // We don't know what kind of actor and group we're dealing with, so we need to determine
        // the actor and group IDs.
        let actor_to_assign_id = transaction
            .determine_actor(actor_to_assign)
            .await
            .change_context(RoleAssignmentError::StoreError)?;
        let actor_group_id = transaction
            .determine_actor_group(actor_group_id)
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        // As long as we use SpiceDB as the authorization backend, we need to check if the actor
        // has permission to add a member to the account group. Also, we need to update the
        // relationship in SpiceDB.
        let has_permission = transaction
            .authorization_api
            .check_account_group_permission(
                actor,
                AccountGroupPermission::AddMember,
                actor_group_id.into(),
                Consistency::FullyConsistent,
            )
            .await
            .change_context(RoleAssignmentError::StoreError)?
            .has_permission;

        if !has_permission {
            return Err(Report::new(RoleAssignmentError::PermissionDenied));
        }

        let role = transaction
            .get_role(actor_group_id, name)
            .await
            .change_context(RoleAssignmentError::StoreError)?
            .ok_or(RoleAssignmentError::RoleNotFound {
                actor_group_id,
                name,
            })?;

        let status = transaction
            .assign_role_by_id(actor_to_assign_id, role.id())
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        let permission_relation = match name {
            RoleName::Administrator => AccountGroupRelationAndSubject::Administrator {
                subject: AccountGroupAdministratorSubject::Account {
                    id: actor_to_assign,
                },
                level: 0,
            },
            RoleName::Member => AccountGroupRelationAndSubject::Member {
                subject: AccountGroupMemberSubject::Account {
                    id: actor_to_assign,
                },
                level: 0,
            },
        };
        transaction
            .authorization_api
            .modify_account_group_relations([(
                ModifyRelationshipOperation::Create,
                actor_group_id.into(),
                permission_relation,
            )])
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        if let Err(error) = transaction
            .commit()
            .await
            .change_context(RoleAssignmentError::StoreError)
        {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_account_group_relations([(
                    ModifyRelationshipOperation::Delete,
                    actor_group_id.into(),
                    permission_relation,
                )])
                .await
                .change_context(RoleAssignmentError::StoreError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(RoleAssignmentError::StoreError))
        } else {
            Ok(status)
        }
    }

    async fn unassign_role(
        &mut self,
        actor: ActorEntityUuid,
        actor_to_unassign: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
        name: RoleName,
    ) -> Result<RoleUnassignmentStatus, Report<RoleAssignmentError>> {
        let mut transaction = self
            .transaction()
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        // We don't know what kind of actor and group we're dealing with, so we need to determine
        // the actor and group IDs.
        let actor_to_unassign_id = transaction
            .determine_actor(actor_to_unassign)
            .await
            .change_context(RoleAssignmentError::StoreError)?;
        let actor_group_id = transaction
            .determine_actor_group(actor_group_id)
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        // As long as we use SpiceDB as the authorization backend, we need to check if the actor
        // has permission to add a member to the account group. Also, we need to update the
        // relationship in SpiceDB.
        let has_permission = transaction
            .authorization_api
            .check_account_group_permission(
                actor,
                AccountGroupPermission::RemoveMember,
                actor_group_id.into(),
                Consistency::FullyConsistent,
            )
            .await
            .change_context(RoleAssignmentError::StoreError)?
            .has_permission;

        if !has_permission {
            return Err(Report::new(RoleAssignmentError::PermissionDenied)
                .attach(StatusCode::PermissionDenied));
        }

        let role = transaction
            .get_role(actor_group_id, name)
            .await
            .change_context(RoleAssignmentError::StoreError)?
            .ok_or(RoleAssignmentError::RoleNotFound {
                actor_group_id,
                name,
            })?;

        let status = transaction
            .unassign_role_by_id(actor_to_unassign_id, role.id())
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        let permission_relation = match name {
            RoleName::Administrator => AccountGroupRelationAndSubject::Administrator {
                subject: AccountGroupAdministratorSubject::Account {
                    id: actor_to_unassign,
                },
                level: 0,
            },
            RoleName::Member => AccountGroupRelationAndSubject::Member {
                subject: AccountGroupMemberSubject::Account {
                    id: actor_to_unassign,
                },
                level: 0,
            },
        };
        transaction
            .authorization_api
            .modify_account_group_relations([(
                ModifyRelationshipOperation::Delete,
                actor_group_id.into(),
                permission_relation,
            )])
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        if let Err(error) = transaction
            .commit()
            .await
            .change_context(RoleAssignmentError::StoreError)
        {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_account_group_relations([(
                    ModifyRelationshipOperation::Touch,
                    actor_group_id.into(),
                    permission_relation,
                )])
                .await
                .change_context(RoleAssignmentError::StoreError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(RoleAssignmentError::StoreError))
        } else {
            Ok(status)
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum OntologyLocation {
    Owned,
    External,
}

#[derive(Debug)]
pub struct ResponseCountMap<T> {
    map: HashMap<T, usize>,
}

impl<T> Default for ResponseCountMap<T> {
    fn default() -> Self {
        Self {
            map: HashMap::new(),
        }
    }
}

impl<T> Extend<T> for ResponseCountMap<T>
where
    T: Eq + Hash + Clone,
{
    fn extend<I>(&mut self, iter: I)
    where
        I: IntoIterator<Item = T>,
    {
        for key in iter {
            *self.map.entry(key).or_insert(0) += 1;
        }
    }
}

impl<T> FromIterator<T> for ResponseCountMap<T>
where
    T: Eq + Hash + Clone,
{
    fn from_iter<I>(iter: I) -> Self
    where
        I: IntoIterator<Item = T>,
    {
        let mut this = Self::default();
        this.extend(iter);
        this
    }
}

#[expect(
    clippy::implicit_hasher,
    reason = "The hasher should not be exposed from `ResponseCountMap`"
)]
impl<T> From<ResponseCountMap<T>> for HashMap<T, usize> {
    fn from(map: ResponseCountMap<T>) -> Self {
        map.map
    }
}

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: Send + Sync,
{
    /// Creates a new `PostgresDatabase` object.
    #[must_use]
    pub const fn new(
        client: C,
        authorization_api: A,
        temporal_client: Option<Arc<TemporalClient>>,
        settings: PostgresStoreSettings,
    ) -> Self {
        Self {
            client,
            authorization_api,
            temporal_client,
            settings,
        }
    }

    async fn create_base_url(
        &self,
        base_url: &BaseUrl,
        on_conflict: ConflictBehavior,
        location: OntologyLocation,
    ) -> Result<(), Report<InsertionError>> {
        match on_conflict {
            ConflictBehavior::Fail => {
                self.as_client()
                    .query(
                        "INSERT INTO base_urls (base_url) VALUES ($1);",
                        &[&base_url.as_str()],
                    )
                    .await
                    .map_err(Report::new)
                    .map_err(|report| match report.current_context().code() {
                        Some(&SqlState::UNIQUE_VIOLATION) => report
                            .change_context(BaseUrlAlreadyExists)
                            .attach_printable(base_url.clone())
                            .change_context(InsertionError),
                        _ => report
                            .change_context(InsertionError)
                            .attach_printable(base_url.clone()),
                    })?;
            }
            ConflictBehavior::Skip => {
                let created = self
                    .as_client()
                    .query_opt(
                        "
                            INSERT INTO base_urls (base_url) VALUES ($1)
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&base_url.as_str()],
                    )
                    .await
                    .change_context(InsertionError)?
                    .is_some();

                if !created {
                    let query = match location {
                        OntologyLocation::Owned => {
                            "
                                SELECT EXISTS (SELECT 1
                                FROM ontology_owned_metadata
                                NATURAL JOIN ontology_ids
                                WHERE base_url = $1);
                            "
                        }
                        OntologyLocation::External => {
                            "
                                SELECT EXISTS (SELECT 1
                                FROM ontology_external_metadata
                                NATURAL JOIN ontology_ids
                                WHERE base_url = $1);
                            "
                        }
                    };

                    let exists_in_specified_location: bool = self
                        .as_client()
                        .query_one(query, &[&base_url.as_str()])
                        .await
                        .change_context(InsertionError)
                        .map(|row| row.get(0))?;

                    if !exists_in_specified_location {
                        return Err(Report::new(BaseUrlAlreadyExists)
                            .attach_printable(base_url.clone())
                            .change_context(InsertionError));
                    }
                }
            }
        }

        Ok(())
    }

    async fn create_ontology_id(
        &self,
        ontology_id: &VersionedUrl,
        on_conflict: ConflictBehavior,
    ) -> Result<Option<OntologyTypeUuid>, Report<InsertionError>> {
        let query: &str = match on_conflict {
            ConflictBehavior::Skip => {
                "
                  INSERT INTO ontology_ids (
                    ontology_id,
                    base_url,
                    version
                  ) VALUES ($1, $2, $3)
                  ON CONFLICT DO NOTHING
                  RETURNING ontology_ids.ontology_id;
                "
            }
            ConflictBehavior::Fail => {
                "
                  INSERT INTO ontology_ids (
                    ontology_id,
                    base_url,
                    version
                  ) VALUES ($1, $2, $3)
                  RETURNING ontology_ids.ontology_id;
                "
            }
        };
        self.as_client()
            .query_opt(
                query,
                &[
                    &OntologyTypeUuid::from_url(ontology_id),
                    &ontology_id.base_url.as_str(),
                    &ontology_id.version,
                ],
            )
            .await
            .map_err(Report::new)
            .map_err(|report| match report.current_context().code() {
                Some(&SqlState::UNIQUE_VIOLATION) => report
                    .change_context(VersionedUrlAlreadyExists)
                    .attach_printable(ontology_id.clone())
                    .change_context(InsertionError),
                _ => report
                    .change_context(InsertionError)
                    .attach_printable(ontology_id.clone()),
            })
            .map(|optional| optional.map(|row| row.get(0)))
    }

    async fn create_ontology_temporal_metadata(
        &self,
        ontology_id: OntologyTypeUuid,
        provenance: &OntologyEditionProvenance,
    ) -> Result<LeftClosedTemporalInterval<TransactionTime>, Report<InsertionError>> {
        let query = "
              INSERT INTO ontology_temporal_metadata (
                ontology_id,
                transaction_time,
                provenance
              ) VALUES ($1, tstzrange(now(), NULL, '[)'), $2)
              RETURNING transaction_time;
            ";

        self.as_client()
            .query_one(query, &[&ontology_id, &provenance])
            .await
            .change_context(InsertionError)
            .map(|row| row.get(0))
    }

    async fn archive_ontology_type(
        &self,
        id: &VersionedUrl,
        archived_by_id: ActorEntityUuid,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        let query = "
          UPDATE ontology_temporal_metadata
          SET
            transaction_time = tstzrange(lower(transaction_time), now(), '[)'),
            provenance = provenance || JSONB_BUILD_OBJECT(
                'archivedById', $3::UUID
            )
          WHERE ontology_id = (
            SELECT ontology_id
            FROM ontology_ids
            WHERE base_url = $1 AND version = $2
          ) AND transaction_time @> now()
          RETURNING transaction_time;
        ";

        let optional = self
            .as_client()
            .query_opt(query, &[&id.base_url, &id.version, &archived_by_id])
            .await
            .change_context(UpdateError)?;
        if let Some(row) = optional {
            Ok(OntologyTemporalMetadata {
                transaction_time: row.get(0),
            })
        } else {
            let exists = self
                .as_client()
                .query_one(
                    "
                        SELECT EXISTS (
                            SELECT 1
                            FROM ontology_ids
                            WHERE base_url = $1 AND version = $2
                        );
                    ",
                    &[&id.base_url.as_str(), &id.version],
                )
                .await
                .change_context(UpdateError)?
                .get(0);

            Err(if exists {
                Report::new(VersionedUrlAlreadyExists)
                    .attach_printable(id.clone())
                    .change_context(UpdateError)
            } else {
                Report::new(OntologyVersionDoesNotExist)
                    .attach_printable(id.clone())
                    .change_context(UpdateError)
            })
        }
    }

    async fn unarchive_ontology_type(
        &self,
        id: &VersionedUrl,
        provenance: &OntologyEditionProvenance,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        let query = "
          INSERT INTO ontology_temporal_metadata (
            ontology_id,
            transaction_time,
            provenance
          ) VALUES (
            (SELECT ontology_id FROM ontology_ids WHERE base_url = $1 AND version = $2),
            tstzrange(now(), NULL, '[)'),
            $3
          )
          RETURNING transaction_time;
        ";

        Ok(OntologyTemporalMetadata {
            transaction_time: self
                .as_client()
                .query_one(query, &[&id.base_url, &id.version, &provenance])
                .await
                .map_err(Report::new)
                .map_err(|report| match report.current_context().code() {
                    Some(&SqlState::EXCLUSION_VIOLATION) => report
                        .change_context(VersionedUrlAlreadyExists)
                        .attach_printable(id.clone())
                        .change_context(UpdateError),
                    Some(&SqlState::NOT_NULL_VIOLATION) => report
                        .change_context(OntologyVersionDoesNotExist)
                        .attach_printable(id.clone())
                        .change_context(UpdateError),
                    _ => report
                        .change_context(UpdateError)
                        .attach_printable(id.clone()),
                })
                .change_context(UpdateError)?
                .get(0),
        })
    }

    async fn create_ontology_owned_metadata(
        &self,
        ontology_id: OntologyTypeUuid,
        web_id: WebId,
    ) -> Result<(), Report<InsertionError>> {
        let query = "
                INSERT INTO ontology_owned_metadata (
                    ontology_id,
                    web_id
                ) VALUES ($1, $2)
            ";

        self.as_client()
            .query(query, &[&ontology_id, &web_id])
            .await
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn create_ontology_external_metadata(
        &self,
        ontology_id: OntologyTypeUuid,
        fetched_at: OffsetDateTime,
    ) -> Result<(), Report<InsertionError>> {
        let query = "
              INSERT INTO ontology_external_metadata (
                ontology_id,
                fetched_at
              ) VALUES ($1, $2);
            ";

        self.as_client()
            .query(query, &[&ontology_id, &fetched_at])
            .await
            .change_context(InsertionError)?;

        Ok(())
    }

    /// Inserts a [`DataType`] identified by [`OntologyTypeUuid`].
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_data_type_with_id(
        &self,
        ontology_id: DataTypeUuid,
        data_type: &Valid<DataType>,
        closed_data_type: &Valid<ClosedDataType>,
    ) -> Result<Option<OntologyTypeUuid>, Report<InsertionError>> {
        let ontology_id = self
            .as_client()
            .query_opt(
                "
                    INSERT INTO data_types (
                        ontology_id,
                        schema,
                        closed_schema
                    ) VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING
                    RETURNING ontology_id;
                ",
                &[&ontology_id, data_type, closed_data_type],
            )
            .await
            .change_context(InsertionError)?
            .map(|row| row.get(0));

        Ok(ontology_id)
    }

    #[tracing::instrument(level = "debug", skip(self))]
    pub async fn insert_data_type_references(
        &self,
        ontology_id: DataTypeUuid,
        metadata: &DataTypeResolveData,
    ) -> Result<(), Report<InsertionError>> {
        for (target, depth) in metadata.inheritance_depths() {
            self.as_client()
                .query(
                    "
                        INSERT INTO data_type_inherits_from (
                            source_data_type_ontology_id,
                            target_data_type_ontology_id,
                            depth
                        ) VALUES (
                            $1,
                            $2,
                            $3
                        );
                    ",
                    &[&ontology_id, &target, &depth],
                )
                .await
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_data_type_conversion(
        &self,
        ontology_id: DataTypeUuid,
        target_data_type: &BaseUrl,
        conversions: &Conversions,
    ) -> Result<(), Report<InsertionError>> {
        self.as_client()
            .query(
                r#"
                    INSERT INTO data_type_conversions (
                        "source_data_type_ontology_id",
                        "target_data_type_base_url",
                        "from",
                        "into"
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        $4
                    );
                "#,
                &[
                    &ontology_id,
                    &target_data_type,
                    &Json(&conversions.from),
                    &Json(&conversions.to),
                ],
            )
            .await
            .change_context(InsertionError)?;

        Ok(())
    }

    /// Inserts a [`PropertyType`] identified by [`OntologyTypeUuid`].
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_property_type_with_id(
        &self,
        ontology_id: OntologyTypeUuid,
        property_type: &Valid<PropertyType>,
    ) -> Result<Option<OntologyTypeUuid>, Report<InsertionError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                    INSERT INTO property_types (
                        ontology_id,
                        schema
                    ) VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                    RETURNING ontology_id;
                ",
                &[&ontology_id, property_type],
            )
            .await
            .change_context(InsertionError)?
            .map(|row| row.get(0)))
    }

    /// Inserts a [`EntityType`] identified by [`OntologyTypeUuid`].
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_entity_type_with_id(
        &self,
        ontology_id: EntityTypeUuid,
        entity_type: &Valid<EntityType>,
        closed_entity_type: &Valid<ClosedEntityType>,
    ) -> Result<Option<OntologyTypeUuid>, Report<InsertionError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                    INSERT INTO entity_types (
                        ontology_id,
                        schema,
                        closed_schema
                    ) VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING
                    RETURNING ontology_id;
                ",
                &[&ontology_id, entity_type, closed_entity_type],
            )
            .await
            .change_context(InsertionError)?
            .map(|row| row.get(0)))
    }

    #[tracing::instrument(level = "debug", skip(self, property_type))]
    async fn insert_property_type_references(
        &self,
        property_type: &PropertyType,
        ontology_id: OntologyTypeUuid,
    ) -> Result<(), Report<InsertionError>> {
        for property_type in property_type.property_type_references() {
            self.as_client()
                .query_one(
                    "
                        INSERT INTO property_type_constrains_properties_on (
                            source_property_type_ontology_id,
                            target_property_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version \
                     = $3)
                        ) RETURNING target_property_type_ontology_id;
                    ",
                    &[
                        &ontology_id,
                        &property_type.url.base_url,
                        &property_type.url.version,
                    ],
                )
                .await
                .change_context(InsertionError)?;
        }

        for data_type in property_type.data_type_references() {
            self.as_client()
                .query_one(
                    "
                        INSERT INTO property_type_constrains_values_on (
                            source_property_type_ontology_id,
                            target_data_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version \
                     = $3)
                        ) RETURNING target_data_type_ontology_id;
                    ",
                    &[
                        &ontology_id,
                        &data_type.url.base_url,
                        &data_type.url.version,
                    ],
                )
                .await
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_entity_type_references(
        &self,
        entity_type_uuid: EntityTypeUuid,
        metadata: &EntityTypeResolveData,
    ) -> Result<(), Report<InsertionError>> {
        for (target_id, depth) in metadata.inheritance_depths() {
            self.as_client()
                .query_one(
                    "
                        INSERT INTO entity_type_inherits_from (
                            source_entity_type_ontology_id,
                            target_entity_type_ontology_id,
                            depth
                        ) VALUES (
                            $1,
                            $2,
                            $3
                        ) RETURNING source_entity_type_ontology_id;
                    ",
                    &[&entity_type_uuid, &target_id, &depth],
                )
                .await
                .change_context(InsertionError)?;
        }
        for (target_id, depth) in metadata.links() {
            self.as_client()
                .query_one(
                    "
                        INSERT INTO entity_type_constrains_links_on (
                            source_entity_type_ontology_id,
                            target_entity_type_ontology_id,
                            inheritance_depth
                        ) VALUES (
                            $1,
                            $2,
                            $3
                        ) RETURNING source_entity_type_ontology_id;
                    ",
                    &[&entity_type_uuid, &target_id, &depth],
                )
                .await
                .change_context(InsertionError)?;
        }
        for (target_id, depth) in metadata.link_destinations() {
            self.as_client()
                .query_one(
                    "
                        INSERT INTO entity_type_constrains_link_destinations_on (
                            source_entity_type_ontology_id,
                            target_entity_type_ontology_id,
                            inheritance_depth
                        ) VALUES (
                            $1,
                            $2,
                            $3
                        ) RETURNING source_entity_type_ontology_id;
                    ",
                    &[&entity_type_uuid, &target_id, &depth],
                )
                .await
                .change_context(InsertionError)?;
        }
        for (target_id, depth) in metadata.properties() {
            self.as_client()
                .query_one(
                    "
                        INSERT INTO entity_type_constrains_properties_on (
                            source_entity_type_ontology_id,
                            target_property_type_ontology_id,
                            inheritance_depth
                        ) VALUES (
                            $1,
                            $2,
                            $3
                        ) RETURNING source_entity_type_ontology_id;
                    ",
                    &[&entity_type_uuid, &target_id, &depth],
                )
                .await
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    // TODO: Tidy these up by having an `Into<VersionedUrl>` method or something for the references
    #[tracing::instrument(level = "debug", skip(self, referenced_entity_types))]
    async fn entity_type_reference_ids<'p, I>(
        &self,
        referenced_entity_types: I,
    ) -> Result<Vec<OntologyTypeUuid>, Report<QueryError>>
    where
        I: IntoIterator<Item = &'p EntityTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_entity_types = referenced_entity_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_entity_types.size_hint().0);
        for reference in referenced_entity_types {
            ids.push(self.ontology_id_by_url(&reference.url).await?);
        }
        Ok(ids)
    }

    #[tracing::instrument(level = "debug", skip(self, referenced_property_types))]
    async fn property_type_reference_ids<'p, I>(
        &self,
        referenced_property_types: I,
    ) -> Result<Vec<OntologyTypeUuid>, Report<QueryError>>
    where
        I: IntoIterator<Item = &'p PropertyTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_property_types = referenced_property_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_property_types.size_hint().0);
        for reference in referenced_property_types {
            ids.push(self.ontology_id_by_url(&reference.url).await?);
        }
        Ok(ids)
    }

    #[tracing::instrument(level = "debug", skip(self, referenced_data_types))]
    async fn data_type_reference_ids<'p, I>(
        &self,
        referenced_data_types: I,
    ) -> Result<Vec<OntologyTypeUuid>, Report<QueryError>>
    where
        I: IntoIterator<Item = &'p DataTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_data_types = referenced_data_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_data_types.size_hint().0);
        for reference in referenced_data_types {
            ids.push(self.ontology_id_by_url(&reference.url).await?);
        }
        Ok(ids)
    }

    /// Fetches the [`OntologyTypeUuid`] of the specified [`VersionedUrl`].
    ///
    /// # Errors:
    ///
    /// - if the entry referred to by `url` does not exist.
    #[tracing::instrument(level = "debug", skip(self))]
    async fn ontology_id_by_url(
        &self,
        url: &VersionedUrl,
    ) -> Result<OntologyTypeUuid, Report<QueryError>> {
        Ok(self
            .client
            .as_client()
            .query_one(
                "
                SELECT ontology_id
                FROM ontology_ids
                WHERE base_url = $1 AND version = $2;
                ",
                &[&url.base_url, &url.version],
            )
            .await
            .change_context(QueryError)
            .attach_printable_lazy(|| url.clone())?
            .get(0))
    }

    /// # Errors
    ///
    /// - if the underlying client cannot start a transaction
    pub async fn transaction(
        &mut self,
    ) -> Result<PostgresStore<tokio_postgres::Transaction<'_>, &'_ mut A>, Report<StoreError>> {
        Ok(PostgresStore::new(
            self.client
                .as_mut_client()
                .transaction()
                .await
                .change_context(StoreError)?,
            &mut self.authorization_api,
            self.temporal_client.clone(),
            self.settings.clone(),
        ))
    }
}

impl<A> PostgresStore<tokio_postgres::Transaction<'_>, A>
where
    A: Send + Sync,
{
    /// Inserts the specified ontology metadata.
    ///
    /// This first extracts the [`BaseUrl`] from the [`VersionedUrl`] and attempts to insert it into
    /// the database. It will create a new [`OntologyTypeUuid`] for this [`VersionedUrl`] and then
    /// finally inserts the entry.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUrl`] already exists and `on_conflict` is [`ConflictBehavior::Fail`]
    /// - If the [`VersionedUrl`] already exists and `on_conflict` is [`ConflictBehavior::Fail`]
    ///
    /// [`BaseUrl`]: type_system::ontology::BaseUrl
    #[tracing::instrument(level = "info", skip(self))]
    async fn create_ontology_metadata(
        &self,
        ontology_id: &VersionedUrl,
        ownership: &OntologyOwnership,
        on_conflict: ConflictBehavior,
        provenance: &OntologyProvenance,
    ) -> Result<Option<(OntologyTypeUuid, OntologyTemporalMetadata)>, Report<InsertionError>> {
        match ownership {
            OntologyOwnership::Local { web_id } => {
                self.create_base_url(&ontology_id.base_url, on_conflict, OntologyLocation::Owned)
                    .await?;
                let ontology_id = self.create_ontology_id(ontology_id, on_conflict).await?;
                if let Some(ontology_id) = ontology_id {
                    let transaction_time = self
                        .create_ontology_temporal_metadata(ontology_id, &provenance.edition)
                        .await?;
                    self.create_ontology_owned_metadata(ontology_id, *web_id)
                        .await?;
                    Ok(Some((
                        ontology_id,
                        OntologyTemporalMetadata { transaction_time },
                    )))
                } else {
                    Ok(None)
                }
            }
            OntologyOwnership::Remote { fetched_at } => {
                self.create_base_url(
                    &ontology_id.base_url,
                    ConflictBehavior::Skip,
                    OntologyLocation::External,
                )
                .await?;
                let ontology_id = self.create_ontology_id(ontology_id, on_conflict).await?;
                if let Some(ontology_id) = ontology_id {
                    let transaction_time = self
                        .create_ontology_temporal_metadata(ontology_id, &provenance.edition)
                        .await?;
                    self.create_ontology_external_metadata(ontology_id, *fetched_at)
                        .await?;
                    Ok(Some((
                        ontology_id,
                        OntologyTemporalMetadata { transaction_time },
                    )))
                } else {
                    Ok(None)
                }
            }
        }
    }

    /// Updates the latest version of [`VersionedUrl::base_url`] and creates a new
    /// [`OntologyTypeUuid`] for it.
    ///
    /// # Errors
    ///
    /// - [`VersionedUrlAlreadyExists`] if [`VersionedUrl`] does already exist in the database
    /// - [`OntologyVersionDoesNotExist`] if the previous version does not exist
    /// - [`OntologyTypeIsNotOwned`] if ontology type is an external ontology type
    #[tracing::instrument(level = "debug", skip(self))]
    async fn update_owned_ontology_id(
        &self,
        url: &VersionedUrl,
        provenance: &OntologyEditionProvenance,
    ) -> Result<(OntologyTypeUuid, WebId, OntologyTemporalMetadata), Report<UpdateError>> {
        let previous_version = OntologyTypeVersion::new(
            url.version
                .inner()
                .checked_sub(1)
                .ok_or(UpdateError)
                .attach_printable(
                    "The version of the data type is already at the lowest possible value",
                )?,
        );
        let Some(web_id) = self
            .as_client()
            .query_opt(
                "
                  SELECT web_id
                  FROM ontology_owned_metadata
                  NATURAL JOIN ontology_ids
                  WHERE base_url = $1
                    AND version = $2
                  LIMIT 1 -- There might be multiple versions of the same ontology, but we only
                          -- care about the `web_id` which does not change when (un-)archiving.
                ;",
                &[&url.base_url, &previous_version],
            )
            .await
            .change_context(UpdateError)?
            .map(|row| row.get(0))
        else {
            let exists: bool = self
                .as_client()
                .query_one(
                    "
                  SELECT EXISTS (
                    SELECT 1
                    FROM ontology_ids
                    WHERE base_url = $1
                      AND version = $2
                  );",
                    &[&url.base_url, &previous_version],
                )
                .await
                .change_context(UpdateError)
                .map(|row| row.get(0))?;
            return Err(if exists {
                Report::new(OntologyTypeIsNotOwned)
                    .attach_printable(url.clone())
                    .change_context(UpdateError)
            } else {
                Report::new(OntologyVersionDoesNotExist)
                    .attach_printable(url.clone())
                    .change_context(UpdateError)
            });
        };

        let ontology_id = self
            .create_ontology_id(url, ConflictBehavior::Fail)
            .await
            .change_context(UpdateError)?
            .expect("ontology id should have been created");

        let transaction_time = self
            .create_ontology_temporal_metadata(ontology_id, provenance)
            .await
            .change_context(UpdateError)?;
        self.create_ontology_owned_metadata(ontology_id, web_id)
            .await
            .change_context(UpdateError)?;

        Ok((
            ontology_id,
            web_id,
            OntologyTemporalMetadata { transaction_time },
        ))
    }

    /// # Errors
    ///
    /// - if the underlying client cannot commit the transaction
    pub async fn commit(self) -> Result<(), Report<StoreError>> {
        self.client.commit().await.change_context(StoreError)
    }

    /// # Errors
    ///
    /// - if the underlying client cannot rollback the transaction
    pub async fn rollback(self) -> Result<(), Report<StoreError>> {
        self.client.rollback().await.change_context(StoreError)
    }
}

impl<C: AsClient, A: AuthorizationApi> AccountStore for PostgresStore<C, A> {
    #[tracing::instrument(level = "info", skip(self))]
    async fn insert_account_id(
        &mut self,
        actor_id: ActorEntityUuid,
        params: InsertAccountIdParams,
    ) -> Result<(), Report<AccountInsertionError>> {
        self.as_client()
            .query(
                "INSERT INTO accounts (account_id) VALUES ($1);",
                &[&params.account_id],
            )
            .await
            .change_context(AccountInsertionError)
            .attach_printable(params.account_id)?;
        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn insert_account_group_id(
        &mut self,
        actor_id: ActorEntityUuid,
        params: InsertAccountGroupIdParams,
    ) -> Result<(), Report<AccountGroupInsertionError>> {
        let transaction = self
            .transaction()
            .await
            .change_context(AccountGroupInsertionError)?;

        transaction
            .as_client()
            .query(
                "INSERT INTO account_groups (account_group_id) VALUES ($1);",
                &[&params.account_group_id],
            )
            .await
            .change_context(AccountGroupInsertionError)
            .attach_printable(params.account_group_id)?;

        transaction
            .authorization_api
            .modify_account_group_relations([(
                ModifyRelationshipOperation::Create,
                params.account_group_id,
                AccountGroupRelationAndSubject::Administrator {
                    subject: AccountGroupAdministratorSubject::Account { id: actor_id },
                    level: 0,
                },
            )])
            .await
            .change_context(AccountGroupInsertionError)?;

        if let Err(error) = transaction
            .commit()
            .await
            .change_context(AccountGroupInsertionError)
        {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_account_group_relations([(
                    ModifyRelationshipOperation::Delete,
                    params.account_group_id,
                    AccountGroupRelationAndSubject::Administrator {
                        subject: AccountGroupAdministratorSubject::Account { id: actor_id },
                        level: 0,
                    },
                )])
                .await
                .change_context(AccountGroupInsertionError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(AccountGroupInsertionError))
        } else {
            Ok(())
        }
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn insert_web_id(
        &mut self,
        actor_id: ActorEntityUuid,
        params: InsertWebIdParams,
    ) -> Result<(), Report<WebInsertionError>> {
        let transaction = self.transaction().await.change_context(WebInsertionError)?;

        transaction
            .as_client()
            .query("INSERT INTO webs (web_id) VALUES ($1);", &[&params.web_id])
            .await
            .change_context(WebInsertionError)
            .attach_printable(params.web_id)?;

        let mut relationships = vec![
            WebRelationAndSubject::Owner {
                subject: params.owner,
                level: 0,
            },
            WebRelationAndSubject::EntityTypeViewer {
                subject: WebEntityTypeViewerSubject::Public,
                level: 0,
            },
            WebRelationAndSubject::PropertyTypeViewer {
                subject: WebPropertyTypeViewerSubject::Public,
                level: 0,
            },
            WebRelationAndSubject::DataTypeViewer {
                subject: WebDataTypeViewerSubject::Public,
                level: 0,
            },
        ];
        if let WebOwnerSubject::AccountGroup { id } = params.owner {
            relationships.extend([
                WebRelationAndSubject::EntityCreator {
                    subject: WebEntityCreatorSubject::AccountGroup {
                        id,
                        set: WebSubjectSet::Member,
                    },
                    level: 0,
                },
                WebRelationAndSubject::EntityEditor {
                    subject: WebEntityEditorSubject::AccountGroup {
                        id,
                        set: WebSubjectSet::Member,
                    },
                    level: 0,
                },
                // TODO: Add ontology type creators
            ]);
        }

        transaction
            .authorization_api
            .modify_web_relations(
                relationships
                    .clone()
                    .into_iter()
                    .map(|relation_and_subject| {
                        (
                            ModifyRelationshipOperation::Create,
                            params.web_id,
                            relation_and_subject,
                        )
                    }),
            )
            .await
            .change_context(WebInsertionError)?;

        if let Err(error) = transaction.commit().await.change_context(WebInsertionError) {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_web_relations(relationships.into_iter().map(|relation_and_subject| {
                    (
                        ModifyRelationshipOperation::Delete,
                        params.web_id,
                        relation_and_subject,
                    )
                }))
                .await
                .change_context(WebInsertionError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(WebInsertionError))
        } else {
            Ok(())
        }
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn identify_subject_id(
        &self,
        subject_id: EntityUuid,
    ) -> Result<WebOwnerSubject, Report<QueryWebError>> {
        let row = self
            .as_client()
            .query_one(
                "
                    SELECT EXISTS (
                        SELECT 1
                        FROM accounts
                        WHERE account_id = $1
                    ), EXISTS (
                        SELECT 1
                        FROM account_groups
                        WHERE account_group_id = $1
                    );
                ",
                &[&subject_id],
            )
            .await
            .change_context(QueryWebError)?;

        match (row.get(0), row.get(1)) {
            (false, false) => Err(Report::new(QueryWebError)
                .attach_printable("Record does not exist")
                .attach_printable(subject_id)),
            (true, false) => Ok(WebOwnerSubject::Account {
                id: ActorEntityUuid::new(subject_id),
            }),
            (false, true) => Ok(WebOwnerSubject::AccountGroup {
                id: ActorGroupEntityUuid::new(subject_id),
            }),
            (true, true) => Err(Report::new(QueryWebError)
                .attach_printable("Record exists in both accounts and account_groups")
                .attach_printable(subject_id)),
        }
    }
}

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: Send + Sync,
{
    #[tracing::instrument(level = "trace", skip(self))]
    pub async fn delete_accounts(
        &mut self,
        actor_id: ActorEntityUuid,
    ) -> Result<(), Report<DeletionError>> {
        self.as_client()
            .client()
            .simple_query("DELETE FROM webs;")
            .await
            .change_context(DeletionError)?;
        self.as_client()
            .client()
            .simple_query("DELETE FROM accounts;")
            .await
            .change_context(DeletionError)?;
        self.as_client()
            .client()
            .simple_query("DELETE FROM account_groups;")
            .await
            .change_context(DeletionError)?;

        Ok(())
    }
}
