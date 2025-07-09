mod crud;
mod knowledge;
mod migration;
mod ontology;
mod pool;
pub mod query;
mod seed_policies;
mod traversal_context;

use alloc::{borrow::Cow, sync::Arc};
use core::{fmt::Debug, hash::Hash};
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ReportSink, ResultExt as _, TryReportStreamExt as _};
use futures::{StreamExt as _, TryStreamExt as _};
use hash_graph_authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    policies::{
        Authorized, ContextBuilder, Effect, Policy, PolicyComponents, PolicyId, Request,
        RequestContext, ResourceId,
        action::ActionName,
        principal::{PrincipalConstraint, actor::AuthenticatedActor},
        resource::{
            DataTypeId, DataTypeResource, EntityResource, EntityTypeId, EntityTypeResource,
            PropertyTypeId, PropertyTypeResource, ResourceConstraint,
        },
        store::{
            CreateWebParameter, CreateWebResponse, PolicyCreationParams, PolicyFilter, PolicyStore,
            PolicyUpdateOperation, PrincipalFilter, PrincipalStore, ResolvePoliciesParams,
            RoleAssignmentStatus, RoleUnassignmentStatus,
            error::{
                BuildDataTypeContextError, BuildEntityContextError, BuildEntityTypeContextError,
                BuildPrincipalContextError, BuildPropertyTypeContextError, CreatePolicyError,
                DetermineActorError, EnsureSystemPoliciesError, GetPoliciesError,
                GetSystemAccountError, RemovePolicyError, RoleAssignmentError, TeamRoleError,
                UpdatePolicyError, WebCreationError, WebRoleError,
            },
        },
    },
    schema::{
        AccountGroupAdministratorSubject, AccountGroupMemberSubject,
        AccountGroupRelationAndSubject, WebDataTypeViewerSubject, WebEntityCreatorSubject,
        WebEntityEditorSubject, WebEntityTypeViewerSubject, WebOwnerSubject,
        WebPropertyTypeViewerSubject, WebRelationAndSubject, WebSubjectSet,
    },
};
use hash_graph_store::{
    account::{
        AccountGroupInsertionError, AccountInsertionError, AccountStore, CreateAiActorParams,
        CreateMachineActorParams, CreateOrgWebParams, CreateTeamParams, CreateUserActorParams,
        CreateUserActorResponse, GetActorError, QueryWebError, TeamRetrievalError,
        WebInsertionError, WebRetrievalError,
    },
    error::{InsertionError, UpdateError},
    query::ConflictBehavior,
};
use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use hash_status::StatusCode;
use hash_temporal_client::TemporalClient;
use postgres_types::{Json, ToSql};
use time::OffsetDateTime;
use tokio_postgres::{GenericClient as _, error::SqlState};
use tracing::Instrument as _;
use type_system::{
    Valid,
    knowledge::entity::{
        EntityId,
        id::{EntityEditionId, EntityUuid},
    },
    ontology::{
        OntologyTemporalMetadata,
        data_type::{ClosedDataType, DataType, DataTypeUuid, schema::DataTypeResolveData},
        entity_type::{
            ClosedEntityType, EntityType, EntityTypeUuid, schema::EntityTypeResolveData,
        },
        id::{BaseUrl, OntologyTypeUuid, OntologyTypeVersion, VersionedUrl},
        property_type::PropertyType,
        provenance::{OntologyEditionProvenance, OntologyOwnership, OntologyProvenance},
    },
    principal::{
        ActorGroup, PrincipalId, PrincipalType,
        actor::{ActorEntityUuid, ActorId, ActorType, Ai, AiId, Machine, MachineId, User, UserId},
        actor_group::{ActorGroupEntityUuid, ActorGroupId, Team, TeamId, Web, WebId},
        role::{RoleId, RoleName, TeamRole, TeamRoleId, WebRole, WebRoleId},
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
    pub skip_embedding_creation: bool,
}

impl Default for PostgresStoreSettings {
    fn default() -> Self {
        Self {
            validate_links: true,
            skip_embedding_creation: false,
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

impl<A> PostgresStore<tokio_postgres::Transaction<'_>, A>
where
    A: AuthorizationApi + Send + Sync,
{
    async fn get_or_create_system_machine_impl(
        &mut self,
        identifier: &str,
    ) -> Result<MachineId, Report<GetSystemAccountError>> {
        if let Some(system_machine_id) = self
            .as_client()
            .query_opt(
                "SELECT id FROM machine_actor WHERE identifier = $1",
                &[&identifier],
            )
            .await
            .change_context(GetSystemAccountError::StoreError)?
            .map(|row| row.get::<_, MachineId>(0))
        {
            tracing::info!(
                %system_machine_id,
                "Found system account"
            );

            Ok(system_machine_id)
        } else {
            let machine_id = self
                .create_machine(None, identifier)
                .await
                .change_context(GetSystemAccountError::CreateSystemAccountFailed)?;

            tracing::info!(
                %machine_id,
                %identifier,
                "Created new system account"
            );

            let system_machine_id = if identifier == "h" {
                // We need to create the system web for the system machine actor, so the system
                // machine needs to be allowed to create webs.
                self.create_policy(
                    machine_id.into(),
                    seed_policies::system_actor_create_web_policy(machine_id),
                )
                .await
                .change_context(GetSystemAccountError::CreateSystemAccountFailed)?;

                machine_id
            } else {
                Box::pin(self.get_or_create_system_machine_impl("h")).await?
            };

            let created_web = self
                .create_web(
                    system_machine_id.into(),
                    CreateWebParameter {
                        id: None,
                        administrator: machine_id.into(),
                        shortname: Some(identifier.to_owned()),
                        is_actor_web: false,
                    },
                )
                .await
                .change_context(GetSystemAccountError::CreateSystemAccountFailed)?;

            tracing::info!(
                %created_web.web_id,
                "Created new system web"
            );

            match identifier {
                "h" => {
                    let instance_admin_team_id = self
                        .create_team(
                            system_machine_id.into(),
                            CreateTeamParams {
                                parent: created_web.web_id.into(),
                                name: "instance-admins".to_owned(),
                            },
                        )
                        .await
                        .change_context(GetSystemAccountError::CreatingInstanceAdminTeamFailed)?;

                    tracing::info!(
                        %instance_admin_team_id,
                        "Created new instance admin team"
                    );
                }
                "google" => {
                    for policy in seed_policies::google_bot_policies(machine_id) {
                        self.create_policy(system_machine_id.into(), policy)
                            .await
                            .change_context(GetSystemAccountError::CreateSystemAccountFailed)?;
                    }
                }
                "linear" => {
                    for policy in seed_policies::linear_bot_policies(machine_id) {
                        self.create_policy(system_machine_id.into(), policy)
                            .await
                            .change_context(GetSystemAccountError::CreateSystemAccountFailed)?;
                    }
                }
                _ => {}
            }

            Ok(machine_id)
        }
    }
}

impl<C, A> PrincipalStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi + Send + Sync,
{
    async fn get_or_create_system_machine(
        &mut self,
        identifier: &str,
    ) -> Result<MachineId, Report<GetSystemAccountError>> {
        let mut transaction = self
            .transaction()
            .await
            .change_context(GetSystemAccountError::StoreError)?;

        let machine_id = transaction
            .get_or_create_system_machine_impl(identifier)
            .await?;

        transaction
            .commit()
            .await
            .change_context(GetSystemAccountError::StoreError)?;

        Ok(machine_id)
    }

    #[expect(
        clippy::too_many_lines,
        reason = "The majority is SpiceDB and its error handling which will be removed soon"
    )]
    async fn create_web(
        &mut self,
        actor: ActorId,
        parameter: CreateWebParameter,
    ) -> Result<CreateWebResponse, Report<WebCreationError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor)
            .with_action(ActionName::CreateWeb, false)
            .await
            .change_context(WebCreationError::BuildPolicyComponents)?;

        let web_id = WebId::new(parameter.id.unwrap_or_else(Uuid::new_v4));

        match policy_components
            .build_policy_set([ActionName::CreateWeb])
            .change_context(WebCreationError::PolicySetCreation)?
            .evaluate(
                &Request {
                    actor: policy_components.actor_id(),
                    action: ActionName::CreateWeb,
                    resource: &ResourceId::Web(web_id),
                    context: RequestContext::default(),
                },
                policy_components.context(),
            )
            .change_context(WebCreationError::StoreError)?
        {
            Authorized::Always => {}
            Authorized::Never => {
                return Err(Report::new(WebCreationError::NotAuthorized))
                    .attach_printable(StatusCode::PermissionDenied);
            }
        }

        let mut transaction = self
            .transaction()
            .await
            .change_context(WebCreationError::StoreError)?;

        transaction
            .as_client()
            .execute(
                "INSERT INTO web (id, shortname) VALUES ($1, $2)",
                &[&web_id, &parameter.shortname],
            )
            .await
            .map_err(|error| match error.code() {
                Some(&SqlState::UNIQUE_VIOLATION) => {
                    Report::new(error).change_context(WebCreationError::AlreadyExists { web_id })
                }
                _ => Report::new(error).change_context(WebCreationError::StoreError),
            })?;

        let machine_id = transaction
            .create_machine(None, &format!("system-{web_id}"))
            .await
            .change_context(WebCreationError::MachineCreationError)?;

        let admin_role_id = Uuid::new_v4();
        let admin_role = transaction
            .create_role(
                Some(admin_role_id),
                ActorGroupId::Web(web_id),
                RoleName::Administrator,
            )
            .await
            .change_context(WebCreationError::RoleCreationError)?;

        transaction
            .assign_role_by_id(parameter.administrator, admin_role)
            .await
            .change_context(WebCreationError::RoleAssignmentError)?;

        let member_role_id = Uuid::new_v4();
        let member_role = transaction
            .create_role(
                Some(member_role_id),
                ActorGroupId::Web(web_id),
                RoleName::Member,
            )
            .await
            .change_context(WebCreationError::RoleCreationError)?;

        transaction
            .assign_role_by_id(machine_id, member_role)
            .await
            .change_context(WebCreationError::RoleAssignmentError)?;

        let web_roles = [
            WebRole {
                id: WebRoleId::new(admin_role_id),
                web_id,
                name: RoleName::Administrator,
            },
            WebRole {
                id: WebRoleId::new(member_role_id),
                web_id,
                name: RoleName::Member,
            },
        ];

        for web_role in web_roles {
            for policy in seed_policies::web_policies(&web_role) {
                transaction
                    .create_policy(actor.into(), policy)
                    .await
                    .change_context(WebCreationError::PolicyCreationError)?;
            }
        }

        let owner = if parameter.is_actor_web {
            // For user-webs we assign the administrator as the owner directly
            WebOwnerSubject::Account {
                id: parameter.administrator.into(),
            }
        } else {
            // For non-user-webs we assign the administrator as the owner via the account group
            transaction
                .authorization_api
                .modify_account_group_relations([(
                    ModifyRelationshipOperation::Create,
                    web_id.into(),
                    AccountGroupRelationAndSubject::Administrator {
                        subject: AccountGroupAdministratorSubject::Account {
                            id: parameter.administrator.into(),
                        },
                        level: 0,
                    },
                )])
                .await
                .change_context(WebCreationError::RoleAssignmentError)?;

            WebOwnerSubject::AccountGroup { id: web_id.into() }
        };

        let mut relationships = vec![
            WebRelationAndSubject::Owner {
                subject: owner,
                level: 0,
            },
            WebRelationAndSubject::Owner {
                subject: WebOwnerSubject::Account {
                    id: machine_id.into(),
                },
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
        if let WebOwnerSubject::AccountGroup { id } = owner {
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
                            web_id,
                            relation_and_subject,
                        )
                    }),
            )
            .await
            .change_context(WebCreationError::RoleAssignmentError)?;

        let response = CreateWebResponse { web_id, machine_id };

        if let Err(error) = transaction
            .commit()
            .await
            .change_context(WebCreationError::StoreError)
        {
            let mut sink = ReportSink::<WebCreationError>::new();
            sink.capture(error);

            sink.attempt(
                self.authorization_api
                    .modify_web_relations(relationships.into_iter().map(|relation_and_subject| {
                        (
                            ModifyRelationshipOperation::Delete,
                            web_id,
                            relation_and_subject,
                        )
                    }))
                    .await
                    .change_context(WebCreationError::RoleAssignmentError),
            );

            if !parameter.is_actor_web {
                sink.attempt(
                    self.authorization_api
                        .modify_account_group_relations([(
                            ModifyRelationshipOperation::Delete,
                            web_id.into(),
                            AccountGroupRelationAndSubject::Administrator {
                                subject: AccountGroupAdministratorSubject::Account {
                                    id: parameter.administrator.into(),
                                },
                                level: 0,
                            },
                        )])
                        .await
                        .change_context(WebCreationError::RoleAssignmentError),
                );
            }

            sink.finish_ok(response)
                .change_context(WebCreationError::RoleAssignmentError)
        } else {
            Ok(response)
        }
    }

    async fn get_web_roles(
        &mut self,
        _actor: ActorEntityUuid,
        web_id: WebId,
    ) -> Result<HashMap<WebRoleId, WebRole>, Report<WebRoleError>> {
        let roles = self
            .as_client()
            .query_raw(
                "
                    SELECT role.id, role.name
                    FROM role
                    WHERE role.actor_group_id = $1 AND role.principal_type = 'web_role'
                ",
                &[&web_id],
            )
            .await
            .change_context(WebRoleError::StoreError)?
            .map_ok(|row| {
                let id = row.get(0);
                let name = row.get(1);
                (id, WebRole { id, web_id, name })
            })
            .try_collect::<HashMap<_, _>>()
            .await
            .change_context(WebRoleError::StoreError)?;

        if roles.is_empty() {
            // We have at least one role per web, so if this is empty, the web does not exist
            return Err(Report::new(WebRoleError::NotFound { web_id }));
        }
        Ok(roles)
    }

    async fn get_team_roles(
        &mut self,
        _actor: ActorEntityUuid,
        team_id: TeamId,
    ) -> Result<HashMap<TeamRoleId, TeamRole>, Report<TeamRoleError>> {
        let roles = self
            .as_client()
            .query_raw(
                "
                    SELECT role.id, role.name
                    FROM role
                    WHERE role.actor_group_id = $1 AND role.principal_type = 'team_role'
                ",
                &[&team_id],
            )
            .await
            .change_context(TeamRoleError::StoreError)?
            .map_ok(|row| {
                let id = row.get(0);
                let name = row.get(1);
                (id, TeamRole { id, team_id, name })
            })
            .try_collect::<HashMap<_, _>>()
            .await
            .change_context(TeamRoleError::StoreError)?;

        if roles.is_empty() {
            // We have at least one role per team, so if this is empty, the team does not exist
            return Err(Report::new(TeamRoleError::NotFound { team_id }));
        }
        Ok(roles)
    }

    async fn assign_role(
        &mut self,
        actor_id: ActorEntityUuid,
        actor_to_assign: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
        name: RoleName,
    ) -> Result<RoleAssignmentStatus, Report<RoleAssignmentError>> {
        if self
            .get_actor_group_role(actor_id, actor_group_id)
            .await
            .change_context(RoleAssignmentError::StoreError)?
            != Some(RoleName::Administrator)
        {
            return Err(Report::new(RoleAssignmentError::PermissionDenied)
                .attach(StatusCode::PermissionDenied));
        }

        let mut transaction = self
            .transaction()
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        // We don't know what kind of actor and group we're dealing with, so we need to determine
        // the actor and group IDs.
        let actor_to_assign_id = transaction
            .determine_actor(actor_to_assign)
            .await
            .change_context(RoleAssignmentError::StoreError)?
            .ok_or(RoleAssignmentError::ActorNotProvided)
            .attach(StatusCode::InvalidArgument)?;
        let actor_group_id = transaction
            .determine_actor_group(actor_group_id)
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        if let Some(already_assigned_role) = transaction
            .get_actor_group_role(actor_to_assign_id.into(), actor_group_id.into())
            .await?
        {
            if already_assigned_role == name {
                return Ok(RoleAssignmentStatus::AlreadyAssigned);
            }
            return Err(Report::new(RoleAssignmentError::AlreadyAssigned {
                actor_id: actor_to_assign_id,
                group_id: actor_group_id,
                name: already_assigned_role,
            }));
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

    async fn get_actor_group_role(
        &mut self,
        actor_id: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
    ) -> Result<Option<RoleName>, Report<RoleAssignmentError>> {
        Ok(self
            .as_client()
            .query_opt(
                "SELECT role.name
                FROM actor_role
                JOIN role ON actor_role.role_id = role.id
                WHERE actor_role.actor_id = $1 AND role.actor_group_id = $2
                ",
                &[&actor_id, &actor_group_id],
            )
            .await
            .change_context(RoleAssignmentError::StoreError)?
            .map(|row| row.get(0)))
    }

    async fn get_role_assignments(
        &mut self,
        actor_group_id: ActorGroupEntityUuid,
        role: RoleName,
    ) -> Result<Vec<ActorEntityUuid>, Report<RoleAssignmentError>> {
        self.as_client()
            .query_raw(
                "SELECT actor_role.actor_id
                 FROM actor_role
                 JOIN role ON actor_role.role_id = role.id
                 WHERE role.actor_group_id = $1 AND role.name = $2",
                [&actor_group_id as &(dyn ToSql + Sync), &role],
            )
            .await
            .change_context(RoleAssignmentError::StoreError)?
            .map_ok(|row| row.get::<_, ActorEntityUuid>(0))
            .try_collect()
            .await
            .change_context(RoleAssignmentError::StoreError)
    }

    async fn unassign_role(
        &mut self,
        actor_id: ActorEntityUuid,
        actor_to_unassign: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
        name: RoleName,
    ) -> Result<RoleUnassignmentStatus, Report<RoleAssignmentError>> {
        if self
            .get_actor_group_role(actor_id, actor_group_id)
            .await
            .change_context(RoleAssignmentError::StoreError)?
            != Some(RoleName::Administrator)
        {
            return Err(Report::new(RoleAssignmentError::PermissionDenied)
                .attach(StatusCode::PermissionDenied));
        }

        let mut transaction = self
            .transaction()
            .await
            .change_context(RoleAssignmentError::StoreError)?;

        // We don't know what kind of actor and group we're dealing with, so we need to determine
        // the actor and group IDs.
        let actor_to_unassign_id = transaction
            .determine_actor(actor_to_unassign)
            .await
            .change_context(RoleAssignmentError::StoreError)?
            .ok_or(RoleAssignmentError::ActorNotProvided)
            .attach(StatusCode::InvalidArgument)?;
        let actor_group_id = transaction
            .determine_actor_group(actor_group_id)
            .await
            .change_context(RoleAssignmentError::StoreError)?;

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

    #[tracing::instrument(skip(self))]
    async fn determine_actor(
        &self,
        actor_entity_uuid: ActorEntityUuid,
    ) -> Result<Option<ActorId>, Report<DetermineActorError>> {
        if actor_entity_uuid.is_public_actor() {
            return Ok(None);
        }

        let row = self
            .as_client()
            .query_opt(
                "SELECT principal_type FROM actor WHERE id = $1",
                &[&actor_entity_uuid],
            )
            .await
            .change_context(DetermineActorError::StoreError)?
            .ok_or(DetermineActorError::ActorNotFound { actor_entity_uuid })?;

        Ok(Some(match row.get(0) {
            PrincipalType::User => ActorId::User(UserId::new(actor_entity_uuid)),
            PrincipalType::Machine => ActorId::Machine(MachineId::new(actor_entity_uuid)),
            PrincipalType::Ai => ActorId::Ai(AiId::new(actor_entity_uuid)),
            principal_type @ (PrincipalType::Web
            | PrincipalType::Team
            | PrincipalType::WebRole
            | PrincipalType::TeamRole) => {
                unreachable!("Unexpected actor type: {principal_type:?}")
            }
        }))
    }

    #[tracing::instrument(level = "debug", skip(self, context_builder))]
    async fn build_principal_context(
        &self,
        actor_id: ActorId,
        context_builder: &mut ContextBuilder,
    ) -> Result<(), Report<BuildPrincipalContextError>> {
        // This function performs multiple database queries to collect all entities needed for
        // policy evaluation, which could become a performance bottleneck for frequently
        // accessed actors. Future optimizations may include:
        //   - Combining some queries into a single more complex query
        //   - Implementing caching strategies for frequently accessed contexts
        //   - Prefetching contexts for related actors in batch operations

        let actor = self
            .get_actor(actor_id.into(), actor_id)
            .await
            .change_context(BuildPrincipalContextError::StoreError)?
            .ok_or(BuildPrincipalContextError::ActorNotFound { actor_id })?;
        context_builder.add_actor(&actor);

        let group_ids = self
            .get_actor_roles(actor_id)
            .await
            .change_context(BuildPrincipalContextError::StoreError)?
            .into_values()
            .map(|role| {
                context_builder.add_role(&role);
                role.actor_group_id()
            })
            .collect::<Vec<_>>();

        self.as_client()
            .query_raw(
                "
                WITH groups AS (
                    SELECT parent_id AS id FROM team_hierarchy WHERE child_id = ANY($1)
                    UNION ALL
                    SELECT id FROM actor_group WHERE id = ANY($1)
                )
                SELECT
                    'team'::PRINCIPAL_TYPE,
                    team.id,
                    team.name,
                    parent.principal_type,
                    parent.id
                 FROM team
                 JOIN groups ON team.id = groups.id
                 JOIN actor_group parent ON team.parent_id = parent.id

                 UNION

                 SELECT
                    'web'::PRINCIPAL_TYPE,
                    web.id,
                    web.shortname,
                    NULL,
                    NULL
                 FROM web
                 JOIN groups ON web.id = groups.id
                 ",
                &[&group_ids],
            )
            .await
            .change_context(BuildPrincipalContextError::StoreError)?
            .map_ok(|row| match row.get(0) {
                PrincipalType::Web => ActorGroup::Web(Web {
                    id: row.get(1),
                    shortname: row.get(2),
                    roles: HashSet::new(),
                }),
                PrincipalType::Team => ActorGroup::Team(Team {
                    id: row.get(1),
                    name: row.get(2),
                    parent_id: match row.get(3) {
                        PrincipalType::Web => ActorGroupId::Web(row.get(4)),
                        PrincipalType::Team => ActorGroupId::Team(row.get(4)),
                        actor_group_type @ (PrincipalType::User
                        | PrincipalType::Machine
                        | PrincipalType::Ai
                        | PrincipalType::WebRole
                        | PrincipalType::TeamRole) => {
                            unreachable!("Unexpected actor group type: {actor_group_type:?}")
                        }
                    },
                    roles: HashSet::new(),
                }),
                actor_group_type @ (PrincipalType::User
                | PrincipalType::Machine
                | PrincipalType::Ai
                | PrincipalType::WebRole
                | PrincipalType::TeamRole) => {
                    unreachable!("Unexpected actor group type: {actor_group_type:?}")
                }
            })
            .try_collect::<Vec<_>>()
            .await
            .change_context(BuildPrincipalContextError::StoreError)?
            .into_iter()
            .for_each(|actor_group| {
                context_builder.add_actor_group(&actor_group);
            });

        Ok(())
    }
}

pub(crate) struct PolicyParts {
    pub id: PolicyId,
    pub name: Option<String>,
    pub effect: Effect,
    pub principal_uuid: Option<Uuid>,
    pub principal_type: Option<PrincipalType>,
    pub actor_type: Option<PrincipalType>,
    pub resource_constraint: Option<ResourceConstraint>,
    pub actions: Vec<ActionName>,
}

impl PolicyParts {
    pub(crate) fn into_policy(self) -> Result<Policy, Report<GetPoliciesError>> {
        let principal_id = match (self.principal_uuid, self.principal_type) {
            (Some(uuid), Some(principal_type)) => Some(PrincipalId::new(uuid, principal_type)),
            (None, None) => None,
            (Some(_), None) | (None, Some(_)) => {
                return Err(Report::new(GetPoliciesError::InvalidPrincipalConstraint));
            }
        };

        let actor_type = self
            .actor_type
            .map(|principal_type| match principal_type {
                PrincipalType::User => Ok(ActorType::User),
                PrincipalType::Machine => Ok(ActorType::Machine),
                PrincipalType::Ai => Ok(ActorType::Ai),
                PrincipalType::Web
                | PrincipalType::Team
                | PrincipalType::WebRole
                | PrincipalType::TeamRole => Err(GetPoliciesError::InvalidPrincipalConstraint),
            })
            .transpose()?;

        let principal_constraint = match (principal_id, actor_type) {
            (None, None) => None,
            (None, Some(actor_type)) => Some(PrincipalConstraint::ActorType { actor_type }),
            (Some(PrincipalId::Actor(actor)), None) => Some(PrincipalConstraint::Actor { actor }),
            (Some(PrincipalId::ActorGroup(actor_group)), actor_type) => {
                Some(PrincipalConstraint::ActorGroup {
                    actor_group,
                    actor_type,
                })
            }
            (Some(PrincipalId::Role(role)), actor_type) => {
                Some(PrincipalConstraint::Role { role, actor_type })
            }
            _ => return Err(Report::new(GetPoliciesError::InvalidPrincipalConstraint)),
        };

        Ok(Policy {
            id: self.id,
            name: self.name,
            effect: self.effect,
            principal: principal_constraint,
            actions: self.actions,
            resource: self.resource_constraint,
            constraints: None,
        })
    }
}

impl<C, A> PolicyStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi + Send + Sync,
{
    async fn create_policy(
        &mut self,
        _authenticated_actor: AuthenticatedActor,
        policy: PolicyCreationParams,
    ) -> Result<PolicyId, Report<CreatePolicyError>> {
        if policy.actions.is_empty() {
            return Err(Report::new(CreatePolicyError::PolicyHasNoActions));
        }

        let policy_id = PolicyId::new(Uuid::new_v4());
        let (principal_id, actor_type) = policy
            .principal
            .as_ref()
            .map(PrincipalConstraint::to_parts)
            .unwrap_or_default();

        let transaction = self
            .as_mut_client()
            .transaction()
            .await
            .change_context(CreatePolicyError::StoreError)?;

        transaction
            .execute("INSERT INTO policy (id) VALUES ($1)", &[&policy_id])
            .await
            .change_context(CreatePolicyError::StoreError)?;

        transaction
            .execute(
                "INSERT INTO policy_edition (
                    id, transaction_time, name, effect, principal_id,
                    principal_type, actor_type, resource_constraint
                ) VALUES (
                    $1, tstzrange(now(), NULL, '[)'), $2, $3, $4, $5, $6, $7
                 )",
                &[
                    &policy_id,
                    &policy.name,
                    &policy.effect,
                    &principal_id,
                    &principal_id.map(PrincipalId::principal_type),
                    &actor_type.map(PrincipalType::from),
                    &policy.resource.as_ref().map(Json),
                ],
            )
            .await
            .map_err(|error| {
                let policy_error = match (error.code(), principal_id) {
                    (Some(&SqlState::UNIQUE_VIOLATION), _) => {
                        CreatePolicyError::PolicyAlreadyExists { id: policy_id }
                    }
                    (Some(&SqlState::FOREIGN_KEY_VIOLATION), Some(principal_id)) => {
                        CreatePolicyError::PrincipalNotFound { id: principal_id }
                    }
                    _ => CreatePolicyError::StoreError,
                };
                Report::new(error).change_context(policy_error)
            })?;

        for action in policy.actions {
            transaction
                .execute(
                    "INSERT INTO policy_action (
                        policy_id,
                        action_name,
                        transaction_time
                    ) VALUES (
                        $1,
                        $2,
                        tstzrange(now(), NULL, '[)')
                    )",
                    &[&policy_id, &action],
                )
                .await
                .map_err(|error| {
                    let policy_error = match error.code() {
                        Some(&SqlState::FOREIGN_KEY_VIOLATION) => {
                            CreatePolicyError::ActionNotFound { id: action }
                        }
                        _ => CreatePolicyError::StoreError,
                    };
                    Report::new(error).change_context(policy_error)
                })?;
        }
        transaction
            .commit()
            .await
            .change_context(CreatePolicyError::StoreError)?;

        Ok(policy_id)
    }

    async fn get_policy_by_id(
        &self,
        _authenticated_actor: AuthenticatedActor,
        id: PolicyId,
    ) -> Result<Option<Policy>, Report<GetPoliciesError>> {
        self.as_client()
            .query_opt(
                "
                SELECT
                    policy_edition.name,
                    policy_edition.effect,
                    policy_edition.principal_id,
                    policy_edition.principal_type,
                    policy_edition.actor_type,
                    policy_edition.resource_constraint,
                    array_remove(array_agg(policy_action.action_name), NULL)
                FROM policy_edition
                LEFT JOIN policy_action
                       ON policy_action.policy_id = policy_edition.id
                      AND policy_action.transaction_time @> now()
                WHERE policy_edition.id = $1 AND policy_edition.transaction_time @> now()
                GROUP BY
                    policy_edition.name, policy_edition.effect, policy_edition.principal_id,
                    policy_edition.principal_type, policy_edition.actor_type,
                    policy_edition.resource_constraint
                ",
                &[&id],
            )
            .await
            .change_context(GetPoliciesError::StoreError)?
            .map(|row| {
                PolicyParts {
                    id,
                    name: row.get(0),
                    effect: row.get(1),
                    principal_uuid: row.get(2),
                    principal_type: row.get(3),
                    actor_type: row.get(4),
                    resource_constraint: row
                        .get::<_, Option<Json<ResourceConstraint>>>(5)
                        .map(|json| json.0),
                    actions: row.get(6),
                }
                .into_policy()
            })
            .transpose()
    }

    async fn query_policies(
        &self,
        _authenticated_actor: AuthenticatedActor,
        filter: &PolicyFilter,
    ) -> Result<Vec<Policy>, Report<GetPoliciesError>> {
        let mut filters = vec!["policy_edition.transaction_time @> now()".to_owned()];
        let mut parameters = Vec::<Box<dyn ToSql + Send + Sync>>::new();

        if let Some(principal) = &filter.principal {
            let (principal_id, actor_type) = match principal {
                PrincipalFilter::Constrained(PrincipalConstraint::ActorType { actor_type }) => {
                    (None, Some(*actor_type))
                }
                PrincipalFilter::Constrained(PrincipalConstraint::Actor { actor }) => {
                    (Some(PrincipalId::Actor(*actor)), None)
                }
                PrincipalFilter::Constrained(PrincipalConstraint::ActorGroup {
                    actor_group,
                    actor_type,
                }) => (Some(PrincipalId::ActorGroup(*actor_group)), *actor_type),
                PrincipalFilter::Constrained(PrincipalConstraint::Role { role, actor_type }) => {
                    (Some(PrincipalId::Role(*role)), *actor_type)
                }
                PrincipalFilter::Unconstrained => (None, None),
            };
            if let Some(principal_id) = principal_id {
                parameters.push(Box::new(principal_id));
                parameters.push(Box::new(principal_id.principal_type()));
                filters.push(format!(
                    "policy_edition.principal_id = ${} AND policy_edition.principal_type = ${}",
                    parameters.len() - 1,
                    parameters.len()
                ));
            } else {
                filters.push(
                    "policy_edition.principal_id IS NULL AND policy_edition.principal_type IS NULL"
                        .to_owned(),
                );
            }

            if let Some(actor_type) = actor_type {
                parameters.push(Box::new(PrincipalType::from(actor_type)));
                filters.push(format!("policy_edition.actor_type = ${}", parameters.len()));
            } else {
                filters.push("policy_edition.actor_type IS NULL".to_owned());
            }
        }

        if let Some(name) = &filter.name {
            parameters.push(Box::new(name));
            filters.push(format!("policy_edition.name = ${}", parameters.len()));
        }

        self.as_client()
            .query_raw(
                &format!(
                    "
                    SELECT
                        policy_edition.id,
                        policy_edition.name,
                        policy_edition.effect,
                        policy_edition.principal_id,
                        policy_edition.principal_type,
                        policy_edition.actor_type,
                        policy_edition.resource_constraint,
                        array_remove(array_agg(policy_action.action_name), NULL)
                    FROM policy_edition
                    LEFT JOIN policy_action
                           ON policy_action.policy_id = policy_edition.id
                          AND policy_action.transaction_time @> now()
                    WHERE {}
                    GROUP BY
                        policy_edition.id,
                        policy_edition.name,
                        policy_edition.effect,
                        policy_edition.principal_id,
                        policy_edition.principal_type,
                        policy_edition.actor_type,
                        policy_edition.resource_constraint
                    ",
                    filters.join(" AND ")
                ),
                parameters,
            )
            .await
            .change_context(GetPoliciesError::StoreError)?
            .map_err(|error| Report::new(error).change_context(GetPoliciesError::StoreError))
            .and_then(async |row| -> Result<_, Report<GetPoliciesError>> {
                PolicyParts {
                    id: PolicyId::new(row.get(0)),
                    name: row.get(1),
                    effect: row.get(2),
                    principal_uuid: row.get(3),
                    principal_type: row.get(4),
                    actor_type: row.get(5),
                    resource_constraint: row
                        .get::<_, Option<Json<ResourceConstraint>>>(6)
                        .map(|json| json.0),
                    actions: row.get(7),
                }
                .into_policy()
            })
            .try_collect()
            .await
    }

    #[expect(clippy::too_many_lines)]
    #[tracing::instrument(level = "info", skip(self, params), fields(actor_id = ?params.actor, action_count = params.actions.len()))]
    async fn resolve_policies_for_actor(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: ResolvePoliciesParams<'_>,
    ) -> Result<Vec<Policy>, Report<GetPoliciesError>> {
        let Some(actor_id) = params.actor else {
            // If no actor is provided, only policies without principal constraints are returned.
            return self
                .query_policies(
                    authenticated_actor,
                    &PolicyFilter {
                        name: None,
                        principal: Some(PrincipalFilter::Unconstrained),
                    },
                )
                .await;
        };

        // The below query does several things. It:
        //   1. gets all principals that the actor can act as
        //   2. gets all policies that apply to those principals
        //   3. TODO: filters the policies based on the action -- currently not implemented
        //   4. TODO: filters the policies based on the resource -- currently not implemented
        //
        // Principals are retrieved by:
        //   - the actor itself, filtered by the actor ID and actor type
        //   - all roles assigned to the actor, filtered by the actor ID
        //   - all actor groups associated with those roles, determined by the role's actor group ID
        //   - all parent actor groups of those actor groups (for teams), determined by the actor
        //     group hierarchy
        //
        // The actions are associated in the `policy_action` table. We join that table and aggregate
        // the actions for each policy. All actions are included, but the action hierarchy is used
        // to determine which actions are relevant to the actor.

        self
            .as_client()
            .query_raw(
                "
                WITH principals AS (
                    -- The actor itself
                    SELECT id, principal_type
                    FROM actor
                    WHERE id = $1 AND principal_type = $2

                    UNION ALL

                    -- All roles directly assigned to the actor
                    SELECT role.id, role.principal_type
                    FROM actor_role
                    JOIN role ON actor_role.role_id = role.id
                    WHERE actor_role.actor_id = $1

                    UNION ALL

                    -- Direct actor group of each role - always included
                    SELECT actor_group.id, actor_group.principal_type
                    FROM actor_role
                    JOIN role ON actor_role.role_id = role.id
                    JOIN actor_group ON actor_group.id = role.actor_group_id
                    WHERE actor_role.actor_id = $1

                    UNION ALL

                    -- All parent actor groups of actor groups (recursively through hierarchy)
                    SELECT parent.id, parent.principal_type
                    FROM actor_role
                    JOIN role ON actor_role.role_id = role.id
                    JOIN team_hierarchy
                      ON team_hierarchy.child_id = role.actor_group_id
                    JOIN actor_group parent ON parent.id = team_hierarchy.parent_id
                    WHERE actor_role.actor_id = $1
                ),
                -- We filter out policies that don't apply to the actor's type or principal ID
                policy_edition AS (
                    -- global and actor-type based policies
                    SELECT policy_edition.*
                    FROM policy_edition
                    WHERE transaction_time @> now()
                      AND principal_id IS NULL
                      AND (actor_type IS NULL OR actor_type = $2)

                    UNION ALL

                    -- actor type policies
                    SELECT policy_edition.*
                    FROM policy_edition
                    JOIN principals
                      ON policy_edition.principal_id = principals.id
                     AND policy_edition.principal_type = principals.principal_type
                    WHERE policy_edition.transaction_time @> now()
                      AND (policy_edition.actor_type IS NULL OR policy_edition.actor_type = $2)
                ),

                -- We have all the policies that apply to the actor, now we associate the actions
                policy_with_actions AS (
                    SELECT
                        policy_edition.id,
                        policy_edition.name,
                        policy_edition.effect,
                        policy_edition.principal_id,
                        policy_edition.principal_type,
                        policy_edition.actor_type,
                        policy_edition.resource_constraint,
                        array_remove(array_agg(policy_action.action_name), NULL) AS actions
                    FROM policy_edition
                    LEFT JOIN policy_action
                        ON policy_action.policy_id = policy_edition.id
                        AND policy_action.transaction_time @> now()
                    GROUP BY
                        policy_edition.id,
                        policy_edition.name,
                        policy_edition.effect,
                        policy_edition.principal_id,
                        policy_edition.principal_type,
                        policy_edition.actor_type,
                        policy_edition.resource_constraint
                )
                SELECT
                    id,
                    name,
                    effect,
                    principal_id,
                    principal_type,
                    actor_type,
                    resource_constraint,
                    actions
                FROM policy_with_actions
                WHERE actions && $3
                ",
                [
                    &actor_id as &(dyn ToSql + Sync),
                    &PrincipalType::from(actor_id.actor_type()),
                    &&*params.actions,
                ],
            )
            .instrument(tracing::info_span!(
                "sql_policy_query_execution",
                actor_uuid = %actor_id,
                actor_type = ?actor_id.actor_type(),
                action_count = params.actions.len()
            ))
            .await
            .change_context(GetPoliciesError::StoreError)?
            .map_err(|error| Report::new(error).change_context(GetPoliciesError::StoreError))
            .and_then(async |row| -> Result<_, Report<GetPoliciesError>> {
                let _span = tracing::info_span!(
                    "policy_conversion",
                    policy_id = ?row.get::<_, PolicyId>(0),
                    has_resource_constraint = row.get::<_, Option<Json<ResourceConstraint>>>(6).is_some()
                ).entered();

                PolicyParts {
                    id: row.get(0),
                    name: row.get(1),
                    effect: row.get(2),
                    principal_uuid: row.get(3),
                    principal_type: row.get(4),
                    actor_type: row.get(5),
                    resource_constraint: row
                        .get::<_, Option<Json<ResourceConstraint>>>(6)
                        .map(|json| json.0),
                    actions: row.get(7),
                }
                .into_policy()
            })
            .try_collect::<Vec<_>>()
            .instrument(tracing::info_span!("policy_result_collection"))
            .await
    }

    #[expect(clippy::too_many_lines)]
    async fn update_policy_by_id(
        &mut self,
        authenticated_actor: AuthenticatedActor,
        policy_id: PolicyId,
        operations: &[PolicyUpdateOperation],
    ) -> Result<Policy, Report<UpdatePolicyError>> {
        let transaction = self
            .transaction()
            .await
            .change_context(UpdatePolicyError::StoreError)?;

        // We check if the policy exists at all first
        let policy_exists = transaction
            .as_client()
            .query_one(
                "SELECT EXISTS (SELECT 1 FROM policy WHERE id = $1)",
                &[&policy_id],
            )
            .await
            .change_context(UpdatePolicyError::StoreError)?
            .get::<_, bool>(0);
        if !policy_exists {
            return Err(Report::new(UpdatePolicyError::PolicyNotFound {
                id: policy_id,
            }));
        }

        let mut actions_to_add = HashSet::new();
        let mut actions_to_remove = HashSet::new();
        let mut effect_to_set = None;
        let mut resource_constraint_to_set = None;

        for operation in operations {
            match operation {
                PolicyUpdateOperation::AddAction { action } => {
                    actions_to_add.insert(*action);
                    actions_to_remove.remove(action);
                }
                PolicyUpdateOperation::RemoveAction { action } => {
                    actions_to_add.remove(action);
                    actions_to_remove.insert(action);
                }
                PolicyUpdateOperation::SetEffect { effect } => {
                    effect_to_set = Some(*effect);
                }
                PolicyUpdateOperation::SetResourceConstraint {
                    resource_constraint,
                } => {
                    resource_constraint_to_set = Some(resource_constraint.as_ref().map(Json));
                }
            }
        }

        if !actions_to_remove.is_empty() {
            let actions_to_remove = actions_to_remove.iter().collect::<Vec<_>>();
            transaction
                .as_client()
                .execute(
                    "
                        UPDATE policy_action
                        SET transaction_time = tstzrange(lower(transaction_time), now(), '[)')
                        WHERE policy_id = $1
                          AND action_name = ANY($2)
                          AND transaction_time @> now()
                    ",
                    &[&policy_id, &actions_to_remove],
                )
                .await
                .change_context(UpdatePolicyError::StoreError)?;
        }

        if !actions_to_add.is_empty() {
            let actions_to_add = actions_to_add.iter().collect::<Vec<_>>();
            transaction
                .as_client()
                .execute(
                    "
                        INSERT INTO policy_action (policy_id, action_name, transaction_time)
                        SELECT $1, unnest($2::text[]), tstzrange(now(), NULL, '[)')
                    ",
                    &[&policy_id, &actions_to_add],
                )
                .await
                .change_context(UpdatePolicyError::StoreError)?;
        }

        let mut parameters: Vec<&(dyn ToSql + Sync)> = vec![&policy_id];
        let effect = effect_to_set
            .as_ref()
            .map_or(Cow::Borrowed("effect"), |effect| {
                parameters.push(effect);
                Cow::Owned(format!("${}", parameters.len()))
            });

        let resource_constraint = resource_constraint_to_set.as_ref().map_or(
            Cow::Borrowed("resource_constraint"),
            |resource_constraint| {
                parameters.push(resource_constraint);
                Cow::Owned(format!("${}", parameters.len()))
            },
        );

        if parameters.len() > 1 {
            transaction
                .as_client()
                .execute(
                    &format!(
                        "
                        WITH updated_policy AS (
                            UPDATE policy_edition
                            SET transaction_time = tstzrange(lower(transaction_time), now(), '[)')
                            WHERE id = $1 AND transaction_time @> now()
                            RETURNING
                                id,
                                name,
                                effect,
                                principal_id,
                                principal_type,
                                actor_type,
                                resource_constraint
                        )
                        INSERT INTO policy_edition (
                            id, name, transaction_time, effect, principal_id,
                            principal_type, actor_type, resource_constraint
                        )
                        SELECT
                            id,
                            name,
                            tstzrange(now(), NULL, '[)'),
                            {effect},
                            principal_id,
                            principal_type,
                            actor_type,
                            {resource_constraint}
                        FROM updated_policy
                        "
                    ),
                    &parameters,
                )
                .await
                .change_context(UpdatePolicyError::StoreError)?;
        }

        let policy = transaction
            .get_policy_by_id(authenticated_actor, policy_id)
            .await
            .change_context(UpdatePolicyError::StoreError)?
            .ok_or_else(|| Report::new(UpdatePolicyError::PolicyNotFound { id: policy_id }))?;
        if policy.actions.is_empty() {
            return Err(Report::new(UpdatePolicyError::PolicyHasNoActions));
        }

        transaction
            .commit()
            .await
            .change_context(UpdatePolicyError::StoreError)?;

        Ok(policy)
    }

    async fn archive_policy_by_id(
        &mut self,
        _authenticated_actor: AuthenticatedActor,
        policy_id: PolicyId,
    ) -> Result<(), Report<RemovePolicyError>> {
        let num_deleted = self
            .as_mut_client()
            .execute(
                "
                    WITH removed_policy AS (
                        UPDATE policy_edition
                        SET transaction_time = tstzrange(lower(transaction_time), now(), '[)')
                        WHERE id = $1 AND transaction_time @> now()
                        RETURNING id
                    )
                    UPDATE policy_action
                    SET transaction_time = tstzrange(lower(transaction_time), now(), '[)')
                    WHERE policy_id = $1 AND transaction_time @> now();
                ",
                &[&policy_id],
            )
            .await
            .change_context(RemovePolicyError::StoreError)?;

        if num_deleted > 0 {
            Ok(())
        } else {
            Err(Report::new(RemovePolicyError::PolicyNotFound {
                id: policy_id,
            }))
        }
    }

    async fn delete_policy_by_id(
        &mut self,
        _authenticated_actor: AuthenticatedActor,
        policy_id: PolicyId,
    ) -> Result<(), Report<RemovePolicyError>> {
        let num_deleted = self
            .as_mut_client()
            .execute("DELETE FROM policy WHERE id = $1", &[&policy_id])
            .await
            .change_context(RemovePolicyError::StoreError)?;

        if num_deleted > 0 {
            Ok(())
        } else {
            Err(Report::new(RemovePolicyError::PolicyNotFound {
                id: policy_id,
            }))
        }
    }

    async fn seed_system_policies(&mut self) -> Result<(), Report<EnsureSystemPoliciesError>> {
        let mut transaction = self
            .transaction()
            .await
            .change_context(EnsureSystemPoliciesError::StoreError)?;

        transaction
            .synchronize_actions()
            .await
            .change_context(EnsureSystemPoliciesError::SynchronizeActions)?;

        let system_machine_actor = transaction
            .get_or_create_system_machine("h")
            .await
            .change_context(EnsureSystemPoliciesError::CreatingSystemMachineFailed)?;

        let roles = transaction
            .as_client()
            .query_raw(
                "
                    SELECT role.id, role.actor_group_id, role.name
                    FROM role
                    WHERE role.principal_type = 'web_role'
                ",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(EnsureSystemPoliciesError::AddRequiredPoliciesFailed)?
            .map_ok(|row| WebRole {
                id: row.get(0),
                web_id: row.get(1),
                name: row.get(2),
            })
            .try_collect::<Vec<_>>()
            .await
            .change_context(EnsureSystemPoliciesError::AddRequiredPoliciesFailed)?;

        let hash_admins_team = transaction
            .get_team_by_name(system_machine_actor.into(), "instance-admins")
            .await
            .change_context(EnsureSystemPoliciesError::ReadInstanceAdminRoles)?
            .ok_or(EnsureSystemPoliciesError::ReadInstanceAdminRoles)?;
        let hash_admins_team_roles = transaction
            .get_team_roles(system_machine_actor.into(), hash_admins_team.id)
            .await
            .change_context(EnsureSystemPoliciesError::ReadInstanceAdminRoles)?;

        let google_account_machine = transaction
            .get_machine_by_identifier(system_machine_actor.into(), "google")
            .await
            .change_context(EnsureSystemPoliciesError::CreatingSystemMachineFailed)?;
        let linear_account_machine = transaction
            .get_machine_by_identifier(system_machine_actor.into(), "linear")
            .await
            .change_context(EnsureSystemPoliciesError::CreatingSystemMachineFailed)?;

        // We only seed policies for the machine if it exists
        let google_bot_policies = google_account_machine
            .as_ref()
            .map(|machine| seed_policies::google_bot_policies(machine.id))
            .into_iter()
            .flatten();
        let linear_bot_policies = linear_account_machine
            .as_ref()
            .map(|machine| seed_policies::linear_bot_policies(machine.id))
            .into_iter()
            .flatten();

        transaction
            .update_seeded_policies(
                ActorId::Machine(system_machine_actor),
                seed_policies::system_actor_policies(system_machine_actor)
                    .chain(seed_policies::global_policies())
                    .chain(roles.iter().flat_map(seed_policies::web_policies))
                    .chain(
                        hash_admins_team_roles
                            .values()
                            .flat_map(seed_policies::instance_admins_policies),
                    )
                    .chain(google_bot_policies)
                    .chain(linear_bot_policies),
            )
            .await?;

        transaction
            .commit()
            .await
            .change_context(EnsureSystemPoliciesError::StoreError)
    }

    #[tracing::instrument(level = "debug", skip(self, entity_type_ids))]
    async fn build_entity_type_context(
        &self,
        entity_type_ids: &[&VersionedUrl],
    ) -> Result<Vec<EntityTypeResource<'_>>, Report<[BuildEntityTypeContextError]>> {
        let () = self
            .as_client()
            .query_raw(
                "
                    SELECT input.idx
                    FROM unnest($1::text[]) WITH ORDINALITY AS input(url, idx)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM entity_types
                        WHERE entity_types.schema ->> '$id' = input.url
                    )",
                [&entity_type_ids],
            )
            .await
            .change_context(BuildEntityTypeContextError::StoreError)?
            .map(|row| {
                let row = row.change_context(BuildEntityTypeContextError::StoreError)?;
                #[expect(
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    clippy::indexing_slicing,
                    reason = "The index is 1-based and is always less than or equal to the length \
                              of the array"
                )]
                Err(Report::new(
                    BuildEntityTypeContextError::EntityTypeNotFound {
                        entity_type_id: entity_type_ids[row.get::<_, i64>(0) as usize - 1].clone(),
                    },
                ))
            })
            .try_collect_reports()
            .await
            .attach(StatusCode::NotFound)?;

        Ok(self
            .as_client()
            .query_raw(
                "
                    WITH filtered AS (
                        SELECT entity_types.ontology_id
                        FROM entity_types
                        WHERE entity_types.schema ->> '$id' = any($1)
                    )
                    SELECT
                        ontology_ids.base_url,
                        ontology_ids.version,
                        ontology_owned_metadata.web_id
                    FROM filtered
                    INNER JOIN ontology_ids
                        ON filtered.ontology_id = ontology_ids.ontology_id
                    LEFT OUTER JOIN ontology_owned_metadata
                        ON ontology_ids.ontology_id = ontology_owned_metadata.ontology_id

                    UNION

                    SELECT
                        ontology_ids.base_url,
                        ontology_ids.version,
                        ontology_owned_metadata.web_id
                    FROM filtered
                    INNER JOIN
                        entity_type_inherits_from
                        ON filtered.ontology_id = source_entity_type_ontology_id
                    INNER JOIN ontology_ids
                        ON target_entity_type_ontology_id = ontology_ids.ontology_id
                    LEFT OUTER JOIN ontology_owned_metadata
                        ON ontology_ids.ontology_id = ontology_owned_metadata.ontology_id;
                 ",
                [&entity_type_ids],
            )
            .await
            .change_context(BuildEntityTypeContextError::StoreError)?
            .map_ok(|row| EntityTypeResource {
                id: Cow::Owned(EntityTypeId::new(VersionedUrl {
                    base_url: row.get(0),
                    version: row.get(1),
                })),
                web_id: row.get(2),
            })
            .try_collect()
            .await
            .change_context(BuildEntityTypeContextError::StoreError)?)
    }

    #[tracing::instrument(level = "debug", skip(self, property_type_ids))]
    async fn build_property_type_context(
        &self,
        property_type_ids: &[&VersionedUrl],
    ) -> Result<Vec<PropertyTypeResource<'_>>, Report<[BuildPropertyTypeContextError]>> {
        let () = self
            .as_client()
            .query_raw(
                "
                    SELECT input.idx
                    FROM unnest($1::text[]) WITH ORDINALITY AS input(url, idx)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM property_types
                        WHERE property_types.schema ->> '$id' = input.url
                    )",
                [&property_type_ids],
            )
            .await
            .change_context(BuildPropertyTypeContextError::StoreError)?
            .map(|row| {
                let row = row.change_context(BuildPropertyTypeContextError::StoreError)?;
                #[expect(
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    clippy::indexing_slicing,
                    reason = "The index is 1-based and is always less than or equal to the length \
                              of the array"
                )]
                Err(Report::new(
                    BuildPropertyTypeContextError::PropertyTypeNotFound {
                        property_type_id: property_type_ids[row.get::<_, i64>(0) as usize - 1]
                            .clone(),
                    },
                ))
            })
            .try_collect_reports()
            .await
            .attach(StatusCode::NotFound)?;

        Ok(self
            .as_client()
            .query_raw(
                "
                    SELECT
                        ontology_ids.base_url,
                        ontology_ids.version,
                        ontology_owned_metadata.web_id
                    FROM property_types
                    INNER JOIN ontology_ids
                        ON property_types.ontology_id = ontology_ids.ontology_id
                    LEFT OUTER JOIN ontology_owned_metadata
                        ON ontology_ids.ontology_id = ontology_owned_metadata.ontology_id
                    WHERE property_types.schema ->> '$id' = any($1);
                 ",
                [&property_type_ids],
            )
            .await
            .change_context(BuildPropertyTypeContextError::StoreError)?
            .map_ok(|row| PropertyTypeResource {
                id: Cow::Owned(PropertyTypeId::new(VersionedUrl {
                    base_url: row.get(0),
                    version: row.get(1),
                })),
                web_id: row.get(2),
            })
            .try_collect()
            .await
            .change_context(BuildPropertyTypeContextError::StoreError)?)
    }

    #[tracing::instrument(level = "debug", skip(self, data_type_ids))]
    async fn build_data_type_context(
        &self,
        data_type_ids: &[&VersionedUrl],
    ) -> Result<Vec<DataTypeResource<'_>>, Report<[BuildDataTypeContextError]>> {
        let () = self
            .as_client()
            .query_raw(
                "
                    SELECT input.idx
                    FROM unnest($1::text[]) WITH ORDINALITY AS input(url, idx)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM data_types
                        WHERE data_types.schema ->> '$id' = input.url
                    )",
                [&data_type_ids],
            )
            .await
            .change_context(BuildDataTypeContextError::StoreError)?
            .map(|row| {
                let row = row.change_context(BuildDataTypeContextError::StoreError)?;
                #[expect(
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    clippy::indexing_slicing,
                    reason = "The index is 1-based and is always less than or equal to the length \
                              of the array"
                )]
                Err(Report::new(BuildDataTypeContextError::DataTypeNotFound {
                    data_type_id: data_type_ids[row.get::<_, i64>(0) as usize - 1].clone(),
                }))
            })
            .try_collect_reports()
            .await
            .attach(StatusCode::NotFound)?;

        Ok(self
            .as_client()
            .query_raw(
                "
                    SELECT
                        ontology_ids.base_url,
                        ontology_ids.version,
                        ontology_owned_metadata.web_id
                    FROM data_types
                    INNER JOIN ontology_ids
                        ON data_types.ontology_id = ontology_ids.ontology_id
                    LEFT OUTER JOIN ontology_owned_metadata
                        ON ontology_ids.ontology_id = ontology_owned_metadata.ontology_id
                    WHERE data_types.schema ->> '$id' = any($1);
                 ",
                [&data_type_ids],
            )
            .await
            .change_context(BuildDataTypeContextError::StoreError)?
            .map_ok(|row| DataTypeResource {
                id: Cow::Owned(DataTypeId::new(VersionedUrl {
                    base_url: row.get(0),
                    version: row.get(1),
                })),
                web_id: row.get(2),
            })
            .try_collect()
            .await
            .change_context(BuildDataTypeContextError::StoreError)?)
    }

    #[tracing::instrument(level = "debug", skip(self, entity_edition_ids))]
    #[expect(
        clippy::too_many_lines,
        reason = "A large part of this function is for a SQL query that is complex but necessary \
                  for the context building."
    )]
    async fn build_entity_context(
        &self,
        entity_edition_ids: &[EntityEditionId],
    ) -> Result<Vec<EntityResource<'static>>, Report<[BuildEntityContextError]>> {
        let () = self
            .as_client()
            .query_raw(
                "
                    SELECT input.idx
                    FROM unnest($1::uuid[]) WITH ORDINALITY AS input(edition_id, idx)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM entity_temporal_metadata
                        WHERE entity_temporal_metadata.entity_edition_id = input.edition_id
                    )",
                [&entity_edition_ids],
            )
            .await
            .change_context(BuildEntityContextError::StoreError)?
            .map(|row| {
                let row = row.change_context(BuildEntityContextError::StoreError)?;
                #[expect(
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    clippy::indexing_slicing,
                    reason = "The index is 1-based and is always less than or equal to the length \
                              of the array"
                )]
                Err(Report::new(BuildEntityContextError::EntityNotFound {
                    entity_edition_id: entity_edition_ids[row.get::<_, i64>(0) as usize - 1],
                }))
            })
            .try_collect_reports()
            .await
            .attach(StatusCode::NotFound)?;

        Ok(self
            .as_client()
            .query_raw(
                "
                    SELECT
                        entity_temporal_metadata.web_id,
                        entity_temporal_metadata.entity_uuid,
                        entity_temporal_metadata.draft_id,
                        created_by.id AS created_by_id,
                        created_by.principal_type AS created_by_type,
                        array_agg(entity_types.schema ->> '$id') AS entity_types
                    FROM entity_temporal_metadata
                    INNER JOIN entity_editions
                        ON entity_temporal_metadata.entity_edition_id
                           = entity_editions.entity_edition_id
                    INNER JOIN actor AS created_by
                        ON (entity_editions.provenance ->> 'createdById')::UUID
                           = created_by.id
                    INNER JOIN entity_is_of_type
                        ON entity_temporal_metadata.entity_edition_id
                           = entity_is_of_type.entity_edition_id
                    INNER JOIN entity_types
                        ON entity_is_of_type.entity_type_ontology_id
                           = entity_types.ontology_id
                    WHERE entity_temporal_metadata.entity_edition_id = any($1::uuid[])
                    GROUP BY
                        entity_temporal_metadata.web_id,
                        entity_temporal_metadata.entity_uuid,
                        entity_temporal_metadata.draft_id,
                        created_by.id,
                        created_by.principal_type;
                 ",
                [&entity_edition_ids],
            )
            .await
            .change_context(BuildEntityContextError::StoreError)?
            .map_ok(|row| {
                let entity_types = row.get::<_, Vec<VersionedUrl>>(5);
                EntityResource {
                    id: EntityId {
                        web_id: row.get(0),
                        entity_uuid: row.get(1),
                        draft_id: row.get(2),
                    },
                    entity_base_types: Cow::Owned(
                        entity_types
                            .iter()
                            .map(|url| url.base_url.clone())
                            .collect(),
                    ),
                    entity_types: Cow::Owned(entity_types),
                    created_by: ActorId::new(
                        row.get::<_, ActorEntityUuid>(3),
                        match row.get(4) {
                            PrincipalType::User => ActorType::User,
                            PrincipalType::Machine => ActorType::Machine,
                            PrincipalType::Ai => ActorType::Ai,
                            principal_type @ (PrincipalType::Web
                            | PrincipalType::Team
                            | PrincipalType::WebRole
                            | PrincipalType::TeamRole) => unreachable!(
                                "Unexpected actor type `{principal_type:?}` in entity context"
                            ),
                        },
                    ),
                }
            })
            .try_collect()
            .await
            .change_context(BuildEntityContextError::StoreError)?)
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

    /// Inserts data type inheritance references into the database.
    ///
    /// This function creates records for data type inheritance relationships
    /// based on the provided metadata, including the inheritance depth.
    ///
    /// # Errors
    ///
    /// Returns [`InsertionError`] if the database insertion operation fails.
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
    async fn create_user_actor(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateUserActorParams,
    ) -> Result<CreateUserActorResponse, Report<AccountInsertionError>> {
        let mut transaction = self
            .transaction()
            .await
            .change_context(AccountInsertionError)?;

        let actor_id = transaction
            .determine_actor(actor_id)
            .await
            .change_context(AccountInsertionError)?
            .ok_or(AccountInsertionError)
            .attach(StatusCode::Unauthenticated)?;

        let user_id = transaction
            .create_user(None)
            .await
            .change_context(AccountInsertionError)?;

        let machine_id = transaction
            .create_web(
                actor_id,
                CreateWebParameter {
                    id: Some(user_id.into()),
                    administrator: if params.registration_complete {
                        user_id.into()
                    } else {
                        actor_id
                    },
                    shortname: params.shortname,
                    is_actor_web: true,
                },
            )
            .await
            .change_context(AccountInsertionError)?
            .machine_id;

        transaction
            .commit()
            .await
            .change_context(AccountInsertionError)?;

        Ok(CreateUserActorResponse {
            user_id,
            machine_id,
        })
    }

    async fn create_machine_actor(
        &mut self,
        _actor_id: ActorEntityUuid,
        params: CreateMachineActorParams,
    ) -> Result<MachineId, Report<AccountInsertionError>> {
        self.create_machine(None, &params.identifier)
            .await
            .change_context(AccountInsertionError)
    }

    async fn get_user_by_id(
        &self,
        _actor_id: ActorEntityUuid,
        id: UserId,
    ) -> Result<Option<User>, Report<GetActorError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT
                    array_remove(array_agg(role.id), NULL),
                    array_remove(array_agg(role.principal_type), NULL)
                FROM user_actor
                LEFT OUTER JOIN actor_role ON user_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                WHERE user_actor.id = $1
                GROUP BY user_actor.id",
                &[&id],
            )
            .await
            .change_context(GetActorError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<Uuid>>(0);
                let principal_types = row.get::<_, Vec<PrincipalType>>(1);
                User {
                    id,
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            PrincipalType::User
                            | PrincipalType::Machine
                            | PrincipalType::Ai
                            | PrincipalType::Web
                            | PrincipalType::Team => {
                                unreachable!("Unexpected role type: {principal_type:?}")
                            }
                        })
                        .collect(),
                }
            }))
    }

    async fn get_machine_by_id(
        &self,
        _actor_id: ActorEntityUuid,
        id: MachineId,
    ) -> Result<Option<Machine>, Report<GetActorError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT
                    machine_actor.identifier,
                    array_remove(array_agg(role.id), NULL),
                    array_remove(array_agg(role.principal_type), NULL)
                FROM machine_actor
                LEFT OUTER JOIN actor_role ON machine_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                WHERE machine_actor.id = $1
                GROUP BY machine_actor.id, machine_actor.identifier",
                &[&id],
            )
            .await
            .change_context(GetActorError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<Uuid>>(1);
                let principal_types = row.get::<_, Vec<PrincipalType>>(2);
                Machine {
                    id,
                    identifier: row.get(0),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            PrincipalType::User
                            | PrincipalType::Machine
                            | PrincipalType::Ai
                            | PrincipalType::Web
                            | PrincipalType::Team => {
                                unreachable!("Unexpected role type: {principal_type:?}")
                            }
                        })
                        .collect(),
                }
            }))
    }

    async fn get_machine_by_identifier(
        &self,
        _actor_id: ActorEntityUuid,
        identifier: &str,
    ) -> Result<Option<Machine>, Report<GetActorError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT
                    machine_actor.id,
                    array_remove(array_agg(role.id), NULL),
                    array_remove(array_agg(role.principal_type), NULL)
                FROM machine_actor
                LEFT OUTER JOIN actor_role ON machine_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                WHERE machine_actor.identifier = $1
                GROUP BY machine_actor.id, machine_actor.identifier",
                &[&identifier],
            )
            .await
            .change_context(GetActorError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<Uuid>>(1);
                let principal_types = row.get::<_, Vec<PrincipalType>>(2);
                Machine {
                    id: row.get(0),
                    identifier: identifier.to_owned(),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            PrincipalType::User
                            | PrincipalType::Machine
                            | PrincipalType::Ai
                            | PrincipalType::Web
                            | PrincipalType::Team => {
                                unreachable!("Unexpected role type: {principal_type:?}")
                            }
                        })
                        .collect(),
                }
            }))
    }

    async fn get_ai_by_id(
        &self,
        _actor_id: ActorEntityUuid,
        id: AiId,
    ) -> Result<Option<Ai>, Report<GetActorError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT
                    ai_actor.identifier,
                    array_remove(array_agg(role.id), NULL),
                    array_remove(array_agg(role.principal_type), NULL)
                FROM ai_actor
                LEFT OUTER JOIN actor_role ON ai_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                WHERE ai_actor.id = $1
                GROUP BY ai_actor.id, ai_actor.identifier",
                &[&id],
            )
            .await
            .change_context(GetActorError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<Uuid>>(1);
                let principal_types = row.get::<_, Vec<PrincipalType>>(2);
                Ai {
                    id,
                    identifier: row.get(0),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            PrincipalType::User
                            | PrincipalType::Machine
                            | PrincipalType::Ai
                            | PrincipalType::Web
                            | PrincipalType::Team => {
                                unreachable!("Unexpected role type: {principal_type:?}")
                            }
                        })
                        .collect(),
                }
            }))
    }

    async fn get_ai_by_identifier(
        &self,
        _actor_id: ActorEntityUuid,
        identifier: &str,
    ) -> Result<Option<Ai>, Report<GetActorError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT
                    ai_actor.id,
                    array_remove(array_agg(role.id), NULL),
                    array_remove(array_agg(role.principal_type), NULL)
                FROM ai_actor
                LEFT OUTER JOIN actor_role ON ai_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                WHERE ai_actor.identifier = $1
                GROUP BY ai_actor.id, ai_actor.identifier",
                &[&identifier],
            )
            .await
            .change_context(GetActorError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<Uuid>>(1);
                let principal_types = row.get::<_, Vec<PrincipalType>>(2);
                Ai {
                    id: row.get(0),
                    identifier: identifier.to_owned(),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            PrincipalType::User
                            | PrincipalType::Machine
                            | PrincipalType::Ai
                            | PrincipalType::Web
                            | PrincipalType::Team => {
                                unreachable!("Unexpected role type: {principal_type:?}")
                            }
                        })
                        .collect(),
                }
            }))
    }

    async fn create_ai_actor(
        &mut self,
        _actor_id: ActorEntityUuid,
        params: CreateAiActorParams,
    ) -> Result<AiId, Report<AccountInsertionError>> {
        self.create_ai(None, &params.identifier)
            .await
            .change_context(AccountInsertionError)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn create_org_web(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateOrgWebParams,
    ) -> Result<CreateWebResponse, Report<WebInsertionError>> {
        let mut transaction = self.transaction().await.change_context(WebInsertionError)?;

        let actor_id = transaction
            .determine_actor(actor_id)
            .await
            .change_context(WebInsertionError)?
            .ok_or(WebInsertionError)
            .attach(StatusCode::Unauthenticated)?;

        let administrator = if let Some(administrator) = params.administrator {
            transaction
                .determine_actor(administrator)
                .await
                .change_context(WebInsertionError)?
                .ok_or(WebInsertionError)
                .attach(StatusCode::InvalidArgument)?
        } else {
            actor_id
        };

        let response = transaction
            .create_web(
                actor_id,
                CreateWebParameter {
                    id: None,
                    shortname: Some(params.shortname),
                    administrator,
                    is_actor_web: false,
                },
            )
            .await
            .change_context(WebInsertionError)?;

        transaction
            .commit()
            .await
            .change_context(WebInsertionError)?;

        Ok(response)
    }

    async fn get_web_by_id(
        &self,
        _actor_id: ActorEntityUuid,
        id: WebId,
    ) -> Result<Option<Web>, Report<WebRetrievalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT
                    web.shortname,
                    array_remove(array_agg(role.id), NULL)
                FROM web
                LEFT OUTER JOIN role ON web.id = role.actor_group_id
                WHERE web.id = $1
                GROUP BY web.shortname
                ",
                &[&id],
            )
            .await
            .change_context(WebRetrievalError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<WebRoleId>>(1);
                Web {
                    id,
                    shortname: row.get(0),
                    roles: role_ids.into_iter().collect(),
                }
            }))
    }

    async fn get_web_by_shortname(
        &self,
        _actor_id: ActorEntityUuid,
        shortname: &str,
    ) -> Result<Option<Web>, Report<WebRetrievalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT
                    web.id,
                    array_remove(array_agg(role.id), NULL)
                FROM web
                LEFT OUTER JOIN role ON web.id = role.actor_group_id
                WHERE web.shortname = $1
                GROUP BY web.id
                ",
                &[&shortname],
            )
            .await
            .change_context(WebRetrievalError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<WebRoleId>>(1);
                Web {
                    id: row.get(0),
                    shortname: Some(shortname.to_owned()),
                    roles: role_ids.into_iter().collect(),
                }
            }))
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn create_team(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateTeamParams,
    ) -> Result<TeamId, Report<AccountGroupInsertionError>> {
        let mut transaction = self
            .transaction()
            .await
            .change_context(AccountGroupInsertionError)?;

        let team_id = transaction
            .insert_team(None, params.parent, &params.name)
            .await
            .change_context(AccountGroupInsertionError)?;

        let admin_role = transaction
            .create_role(None, ActorGroupId::Team(team_id), RoleName::Administrator)
            .await
            .change_context(AccountGroupInsertionError)?;

        let _member_role = transaction
            .create_role(None, ActorGroupId::Team(team_id), RoleName::Member)
            .await
            .change_context(AccountGroupInsertionError)?;

        transaction
            .assign_role_by_id(
                transaction
                    .determine_actor(actor_id)
                    .await
                    .change_context(AccountGroupInsertionError)?
                    .ok_or(AccountGroupInsertionError)
                    .attach(StatusCode::InvalidArgument)?,
                admin_role,
            )
            .await
            .change_context(AccountGroupInsertionError)?;

        transaction
            .authorization_api
            .modify_account_group_relations([(
                ModifyRelationshipOperation::Create,
                team_id.into(),
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
                    team_id.into(),
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
            Ok(team_id)
        }
    }

    async fn get_team_by_id(
        &self,
        _actor_id: ActorEntityUuid,
        id: TeamId,
    ) -> Result<Option<Team>, Report<TeamRetrievalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT
                    parent.principal_type,
                    parent.id,
                    team.name,
                    array_remove(array_agg(role.id), NULL)
                FROM team
                JOIN actor_group AS parent ON parent.id = parent_id
                LEFT OUTER JOIN role ON team.id = role.actor_group_id
                WHERE team.id = $1
                GROUP BY team.id, parent.principal_type, parent.id
                ",
                &[&id],
            )
            .await
            .change_context(TeamRetrievalError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<TeamRoleId>>(3);
                Team {
                    id,
                    parent_id: match row.get(0) {
                        PrincipalType::Web => ActorGroupId::Web(row.get(1)),
                        PrincipalType::Team => ActorGroupId::Team(row.get(1)),
                        principal_type @ (PrincipalType::User
                        | PrincipalType::Machine
                        | PrincipalType::Ai
                        | PrincipalType::WebRole
                        | PrincipalType::TeamRole) => {
                            unreachable!("Unexpected principal type {principal_type}")
                        }
                    },
                    name: row.get(2),
                    roles: role_ids.into_iter().collect(),
                }
            }))
    }

    async fn get_team_by_name(
        &self,
        _actor_id: ActorEntityUuid,
        name: &str,
    ) -> Result<Option<Team>, Report<TeamRetrievalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT
                    team.id,
                    parent.principal_type,
                    parent.id,
                    array_remove(array_agg(role.id), NULL)
                FROM team
                JOIN actor_group AS parent ON parent.id = parent_id
                LEFT OUTER JOIN role ON team.id = role.actor_group_id
                WHERE team.name = $1
                GROUP BY team.id, parent.principal_type, parent.id
                ",
                &[&name],
            )
            .await
            .change_context(TeamRetrievalError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<TeamRoleId>>(3);
                Team {
                    id: row.get(0),
                    parent_id: match row.get(1) {
                        PrincipalType::Web => ActorGroupId::Web(row.get(2)),
                        PrincipalType::Team => ActorGroupId::Team(row.get(2)),
                        principal_type @ (PrincipalType::User
                        | PrincipalType::Machine
                        | PrincipalType::Ai
                        | PrincipalType::WebRole
                        | PrincipalType::TeamRole) => {
                            unreachable!("Unexpected principal type {principal_type}")
                        }
                    },
                    name: name.to_owned(),
                    roles: role_ids.into_iter().collect(),
                }
            }))
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn identify_subject_id(
        &self,
        subject_id: EntityUuid,
    ) -> Result<WebOwnerSubject, Report<QueryWebError>> {
        let actor_uuid = ActorEntityUuid::new(subject_id);
        if self
            .is_actor(actor_uuid)
            .await
            .change_context(QueryWebError)?
        {
            Ok(WebOwnerSubject::Account { id: actor_uuid })
        } else if self
            .is_web(WebId::new(subject_id))
            .await
            .change_context(QueryWebError)?
        {
            Ok(WebOwnerSubject::AccountGroup {
                id: ActorGroupEntityUuid::new(subject_id),
            })
        } else {
            Err(Report::new(QueryWebError).attach_printable(subject_id))
        }
    }
}

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: Send + Sync,
{
    /// Deletes all principals (policies and actions) from the database.
    ///
    /// This function removes all policies and actions, effectively clearing
    /// all authorization data from the system.
    ///
    /// # Errors
    ///
    /// Returns [`DeletionError`] if any of the database deletion operations fail.
    #[tracing::instrument(level = "trace", skip(self))]
    pub async fn delete_principals(
        &self,
        actor_id: ActorEntityUuid,
    ) -> Result<(), Report<DeletionError>> {
        self.as_client()
            .client()
            .simple_query("DELETE FROM policy;")
            .await
            .change_context(DeletionError)?;
        self.as_client()
            .client()
            .simple_query("DELETE FROM action;")
            .await
            .change_context(DeletionError)?;
        self.as_client()
            .client()
            .simple_query("DELETE FROM principal;")
            .await
            .change_context(DeletionError)?;

        Ok(())
    }
}
