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

use error_stack::{Report, ReportSink, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    policies::{
        Authorized, Effect, PartialResourceId, Policy, PolicyId, PolicySet, Request,
        RequestContext,
        action::ActionName,
        principal::PrincipalConstraint,
        resource::ResourceConstraint,
        store::{
            CreateWebParameter, CreateWebResponse, PolicyFilter, PolicyStore, PrincipalFilter,
            PrincipalStore, RoleAssignmentStatus, RoleUnassignmentStatus,
            error::{
                EnsureSystemPoliciesError, GetPoliciesError, GetSystemAccountError,
                RoleAssignmentError, WebCreationError,
            },
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
        AccountGroupInsertionError, AccountInsertionError, AccountStore, CreateAiActorParams,
        CreateMachineActorParams, CreateOrgWebParams, CreateTeamParams, CreateUserActorParams,
        CreateUserActorResponse, GetTeamResponse, GetWebResponse, QueryWebError,
        TeamRetrievalError, WebInsertionError, WebRetrievalError,
    },
    error::{InsertionError, QueryError, UpdateError},
    query::ConflictBehavior,
};
use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
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
        PrincipalId, PrincipalType,
        actor::{ActorEntityUuid, ActorId, ActorType, AiId, MachineId},
        actor_group::{ActorGroupEntityUuid, ActorGroupId, TeamId, WebId},
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
    A: AuthorizationApi + Send + Sync,
{
    async fn ensure_system_policies_impl(
        &mut self,
        system_machine_actor: ActorId,
    ) -> Result<(), Report<EnsureSystemPoliciesError>> {
        tracing::info!("Seeding system policies");
        for policy in self
            .resolve_policies_for_actor(system_machine_actor.into(), system_machine_actor)
            .await
            .change_context(EnsureSystemPoliciesError::ReadPoliciesFailed)?
        {
            match policy.principal {
                Some(PrincipalConstraint::Actor { actor }) if actor == system_machine_actor => {
                    // TODO: Implement logic for handling removal of old policies to avoid
                    //       that we re-create policies that are already present.
                    self.remove_policy(policy.id)
                        .await
                        .change_context(EnsureSystemPoliciesError::RemoveOldPolicyFailed)?;
                }
                _ => {
                    // We don't want to remove policies that are not for the system machine actor
                }
            }
        }

        self.synchronize_actions()
            .await
            .change_context(EnsureSystemPoliciesError::SynchronizeActions)?;

        self.create_policy(Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Actor {
                actor: system_machine_actor,
            }),
            actions: vec![ActionName::CreateWeb],
            resource: None,
            constraints: None,
        })
        .await
        .change_context(EnsureSystemPoliciesError::AddRequiredPoliciesFailed)?;

        Ok(())
    }
}

impl<C, A> PrincipalStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi + Send + Sync,
{
    async fn get_or_create_system_actor(
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
            let mut transaction = self
                .transaction()
                .await
                .change_context(GetSystemAccountError::StoreError)?;

            let system_machine_id = transaction
                .create_machine(None, identifier)
                .await
                .change_context(GetSystemAccountError::CreateSystemAccountFailed)?;

            tracing::info!(
                %system_machine_id,
                %identifier,
                "Created new system account"
            );

            // We need to create the system web for the system machine actor, so the system machine
            // needs to be allowed to create webs.
            transaction
                .ensure_system_policies_impl(ActorId::Machine(system_machine_id))
                .await
                .change_context(GetSystemAccountError::CreateSystemAccountFailed)?;

            let web_creation = transaction
                .create_web(
                    system_machine_id.into(),
                    CreateWebParameter {
                        id: None,
                        administrator: system_machine_id.into(),
                        shortname: Some(identifier.to_owned()),
                        is_actor_web: false,
                    },
                )
                .await
                .change_context(GetSystemAccountError::CreateSystemAccountFailed)?;

            tracing::info!(
                %web_creation.web_id,
                "Created new system web"
            );

            if identifier == "h" {
                let instance_admin_team_id = transaction
                    .create_team(
                        system_machine_id.into(),
                        CreateTeamParams {
                            parent: web_creation.web_id.into(),
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

            transaction
                .commit()
                .await
                .change_context(GetSystemAccountError::StoreError)?;

            Ok(system_machine_id)
        }
    }

    async fn ensure_system_policies(&mut self) -> Result<(), Report<EnsureSystemPoliciesError>> {
        let system_machine_actor = Box::pin(self.get_or_create_system_actor("h"))
            .await
            .change_context(EnsureSystemPoliciesError::CreatingSystemMachineFailed)
            .map(ActorId::Machine)?;

        self.ensure_system_policies_impl(system_machine_actor)
            .await
            .change_context(EnsureSystemPoliciesError::CreatingSystemMachineFailed)
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
        let context = self
            .build_principal_context(actor)
            .await
            .change_context(WebCreationError::StoreError)?;
        let policies = self
            .resolve_policies_for_actor(actor.into(), actor)
            .await
            .change_context(WebCreationError::StoreError)?;

        let web_id = WebId::new(parameter.id.unwrap_or_else(Uuid::new_v4));

        let policy_set = PolicySet::default()
            .with_policies(&policies)
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

        let admin_role = transaction
            .create_role(None, ActorGroupId::Web(web_id), RoleName::Administrator)
            .await
            .change_context(WebCreationError::RoleCreationError)?;

        transaction
            .assign_role_by_id(parameter.administrator, admin_role)
            .await
            .change_context(WebCreationError::RoleAssignmentError)?;

        let member_role = transaction
            .create_role(None, ActorGroupId::Web(web_id), RoleName::Member)
            .await
            .change_context(WebCreationError::RoleCreationError)?;

        transaction
            .assign_role_by_id(machine_id, member_role)
            .await
            .change_context(WebCreationError::RoleAssignmentError)?;

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

    async fn assign_role(
        &mut self,
        actor_id: ActorEntityUuid,
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
                actor_id,
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

        if let Some(already_assigned_role) = transaction
            .is_assigned(actor_to_assign_id.into(), actor_group_id.into())
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

    async fn is_assigned(
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
                actor_id,
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

struct PolicyParts {
    id: PolicyId,
    effect: Effect,
    principal_uuid: Option<Uuid>,
    principal_type: Option<PrincipalType>,
    actor_type: Option<PrincipalType>,
    resource_constraint: Option<ResourceConstraint>,
    actions: Vec<ActionName>,
}
impl PolicyParts {
    fn into_policy(self) -> Result<Policy, Report<GetPoliciesError>> {
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
                _ => Err(GetPoliciesError::InvalidPrincipalConstraint),
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
    async fn get_policy_by_id(
        &self,
        _authenticated_actor: ActorEntityUuid,
        policy_id: PolicyId,
    ) -> Result<Option<Policy>, Report<GetPoliciesError>> {
        self.as_client()
            .query_opt(
                "
                SELECT
                    policy.id,
                    policy.effect,
                    policy.principal_id,
                    policy.principal_type,
                    policy.actor_type,
                    policy.resource_constraint,
                    array_agg(policy_action.action_name)
                FROM policy
                JOIN policy_action ON policy.id = policy_action.policy_id
                WHERE policy.id = $1
                GROUP BY
                    policy.id, policy.effect, policy.principal_id, policy.principal_type,
                    policy.actor_type, policy.resource_constraint
                ",
                &[&policy_id],
            )
            .await
            .change_context(GetPoliciesError::StoreError)?
            .map(|row| {
                PolicyParts {
                    id: row.get(0),
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
        _authenticated_actor: ActorEntityUuid,
        filter: &PolicyFilter,
    ) -> Result<Vec<Policy>, Report<GetPoliciesError>> {
        let mut filters = Vec::new();
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
                    "policy.principal_id = ${} AND policy.principal_type = ${}",
                    parameters.len() - 1,
                    parameters.len()
                ));
            } else {
                filters.push(
                    "policy.principal_id IS NULL AND policy.principal_type IS NULL".to_owned(),
                );
            }

            if let Some(actor_type) = actor_type {
                parameters.push(Box::new(PrincipalType::from(actor_type)));
                filters.push(format!("policy.actor_type = ${}", parameters.len()));
            } else {
                filters.push("policy.actor_type IS NULL".to_owned());
            }
        }

        let base_query = "
            SELECT
                policy.id,
                policy.effect,
                policy.principal_id,
                policy.principal_type,
                policy.actor_type,
                policy.resource_constraint,
                array_agg(policy_action.action_name)
            FROM policy
            JOIN policy_action ON policy.id = policy_action.policy_id
            "
        .to_owned();
        let group_by_query = "
            GROUP BY
                policy.id,
                policy.effect,
                policy.principal_id,
                policy.principal_type,
                policy.actor_type,
                policy.resource_constraint
            ";

        let query = if filters.is_empty() {
            format!("{base_query} {group_by_query}")
        } else {
            format!(
                "{base_query} WHERE {} {group_by_query}",
                filters.join(" AND ")
            )
        };

        self.as_client()
            .query_raw(&query, parameters)
            .await
            .change_context(GetPoliciesError::StoreError)?
            .map_err(|error| Report::new(error).change_context(GetPoliciesError::StoreError))
            .and_then(async |row| -> Result<_, Report<GetPoliciesError>> {
                PolicyParts {
                    id: PolicyId::new(row.get(0)),
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
            .try_collect()
            .await
    }

    async fn resolve_policies_for_actor(
        &self,
        _authenticated_actor: ActorEntityUuid,
        actor_id: ActorId,
    ) -> Result<Vec<Policy>, Report<GetPoliciesError>> {
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
        self.as_client()
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
                policy AS (
                    -- global and actor-type based policies
                    SELECT policy.*
                    FROM policy
                    WHERE principal_id IS NULL
                      AND (actor_type IS NULL OR actor_type = $2)

                    UNION ALL

                    -- actor type policies
                    SELECT policy.*
                    FROM policy
                    JOIN principals
                      ON policy.principal_id = principals.id
                     AND policy.principal_type = principals.principal_type
                    WHERE policy.actor_type IS NULL OR policy.actor_type = $2
                )
                SELECT
                    policy.id,
                    policy.effect,
                    policy.principal_id,
                    policy.principal_type,
                    policy.actor_type,
                    policy.resource_constraint,
                    array_agg(policy_action.action_name)
                FROM policy
                JOIN policy_action ON policy.id = policy_action.policy_id
                GROUP BY
                    policy.id, policy.effect, policy.principal_id, policy.principal_type,
                    policy.actor_type, policy.resource_constraint
                ",
                [
                    &actor_id as &(dyn ToSql + Sync),
                    &PrincipalType::from(actor_id.actor_type()),
                ],
            )
            .await
            .change_context(GetPoliciesError::StoreError)?
            .map_err(|error| Report::new(error).change_context(GetPoliciesError::StoreError))
            .and_then(async |row| -> Result<_, Report<GetPoliciesError>> {
                PolicyParts {
                    id: row.get(0),
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
            .try_collect::<Vec<_>>()
            .await
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
            .change_context(AccountInsertionError)?;

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
            .change_context(WebInsertionError)?;

        let administrator = if let Some(administrator) = params.administrator {
            transaction
                .determine_actor(administrator)
                .await
                .change_context(WebInsertionError)?
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
        &mut self,
        _actor_id: ActorEntityUuid,
        web_id: WebId,
    ) -> Result<Option<GetWebResponse>, Report<WebRetrievalError>> {
        let Some(shortname) = self
            .as_client()
            .query_opt("SELECT shortname FROM web WHERE id = $1", &[&web_id])
            .await
            .change_context(WebRetrievalError)?
            .map(|row| row.get(0))
        else {
            return Ok(None);
        };

        let Some(machine_id) = self
            .as_client()
            .query_opt(
                "SELECT id FROM machine_actor WHERE identifier = $1",
                &[&format!("system-{web_id}")],
            )
            .await
            .change_context(WebRetrievalError)?
            .map(|row| row.get(0))
        else {
            return Ok(None);
        };

        tracing::info!("Found web with id {web_id} and machine id {machine_id}");

        Ok(Some(GetWebResponse {
            web_id,
            machine_id,
            shortname,
        }))
    }

    async fn get_web_by_shortname(
        &mut self,
        _actor_id: ActorEntityUuid,
        shortname: &str,
    ) -> Result<Option<GetWebResponse>, Report<WebRetrievalError>> {
        let Some(web_id) = self
            .as_client()
            .query_opt("SELECT id FROM web WHERE shortname = $1", &[&shortname])
            .await
            .change_context(WebRetrievalError)?
            .map(|row| row.get(0))
        else {
            return Ok(None);
        };

        let Some(machine_id) = self
            .as_client()
            .query_opt(
                "SELECT id FROM machine_actor WHERE identifier = $1",
                &[&format!("system-{web_id}")],
            )
            .await
            .change_context(WebRetrievalError)?
            .map(|row| row.get(0))
        else {
            return Ok(None);
        };

        tracing::info!(
            "Found web with id {web_id} and machine id {machine_id} for shortname {shortname}"
        );

        Ok(Some(GetWebResponse {
            web_id,
            machine_id,
            shortname: Some(shortname.to_owned()),
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
                    .change_context(AccountGroupInsertionError)?,
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

    async fn get_team_by_name(
        &mut self,
        _actor_id: ActorEntityUuid,
        name: &str,
    ) -> Result<Option<GetTeamResponse>, Report<TeamRetrievalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT team.id, parent.principal_type, parent.id
                FROM team
                JOIN principal AS parent ON parent.id = team.parent_id
                WHERE team.name = $1",
                &[&name],
            )
            .await
            .change_context(TeamRetrievalError)?
            .map(|row| GetTeamResponse {
                team_id: row.get(0),
                parent_id: match row.get(1) {
                    PrincipalType::Web => ActorGroupId::Web(row.get(2)),
                    PrincipalType::Team => ActorGroupId::Team(row.get(2)),
                    other => unreachable!("Unexpected actor group type: {other:?}"),
                },
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
    #[tracing::instrument(level = "trace", skip(self))]
    pub async fn delete_principals(
        &mut self,
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
