//! Mock store for authorization unit tests.
//!
//! Returns pre-configured policies without requiring a database connection.

use alloc::alloc::Global;
use core::future;
use std::collections::HashSet;

use error_stack::Report;
use hash_graph_authorization::policies::{
    ContextBuilder, Effect, MergePolicies, Policy, PolicyComponents, PolicyId, ResolvedPolicy,
    action::ActionName,
    principal::actor::AuthenticatedActor,
    resource::{
        DataTypeResource, EntityResource, EntityTypeResource, PropertyTypeResource,
        ResourceConstraint,
    },
    store::{
        CreateWebParameter, CreateWebResponse, PolicyCreationParams, PolicyFilter, PolicyStore,
        PolicyUpdateOperation, PrincipalStore, ResolvePoliciesParams, RoleAssignmentStatus,
        RoleUnassignmentStatus,
        error::{
            BuildDataTypeContextError, BuildEntityContextError, BuildEntityTypeContextError,
            BuildPrincipalContextError, BuildPropertyTypeContextError, CreatePolicyError,
            DetermineActorError, EnsureSystemPoliciesError, GetPoliciesError,
            GetSystemAccountError, RemovePolicyError, RoleAssignmentError, TeamRoleError,
            UpdatePolicyError, WebCreationError, WebRoleError,
        },
    },
};
use type_system::{
    knowledge::entity::id::EntityEditionId,
    ontology::{BaseUrl, VersionedUrl, id::OntologyTypeVersion},
    principal::{
        actor::{ActorEntityUuid, ActorId, MachineId, UserId},
        actor_group::{ActorGroupEntityUuid, ActorGroupId, TeamId, WebId},
        role::{RoleName, TeamRole, TeamRoleId, WebRole, WebRoleId},
    },
};
use uuid::Uuid;

use super::{policy::PolicyTranslationUnit, protection::ProtectionTranslationUnit};
use crate::postgres::{
    Parameters,
    parameters::AuxiliaryParameters,
    projections::{AuxiliaryProjections, Projections},
};

pub(crate) struct Fixture {
    pub projections: AuxiliaryProjections,
    pub parameters: AuxiliaryParameters<Global>,
}

impl Fixture {
    pub(crate) fn new() -> Self {
        let base = Projections::new();
        let params = Parameters::new_in(Global);

        Self {
            projections: AuxiliaryProjections::new(&base),
            parameters: AuxiliaryParameters::new(&params, Global),
        }
    }

    pub(crate) fn policy(&mut self) -> PolicyTranslationUnit<'_, Global> {
        PolicyTranslationUnit {
            projections: &mut self.projections,
            parameters: &mut self.parameters,
            actor_id: Some(ActorId::User(UserId::new(ACTOR_UUID))),
        }
    }

    pub(crate) fn policy_anon(&mut self) -> PolicyTranslationUnit<'_, Global> {
        PolicyTranslationUnit {
            projections: &mut self.projections,
            parameters: &mut self.parameters,
            actor_id: None,
        }
    }

    pub(crate) fn protection(&mut self) -> ProtectionTranslationUnit<'_, Global> {
        ProtectionTranslationUnit {
            projections: &mut self.projections,
            parameters: &mut self.parameters,
            actor_id: Some(ActorId::User(UserId::new(ACTOR_UUID))),
        }
    }
}

/// Returns pre-configured policies for a given actor.
pub(crate) struct MockStore<F> {
    pub actor_id: Option<ActorId>,
    pub is_instance_admin: bool,
    pub policies: Vec<F>,
}

impl<F> PolicyStore for MockStore<F>
where
    F: Fn() -> ResolvedPolicy + Send + Sync,
{
    async fn create_policy(
        &mut self,
        _: AuthenticatedActor,
        _: PolicyCreationParams,
    ) -> Result<PolicyId, Report<CreatePolicyError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn get_policy_by_id(
        &self,
        _: AuthenticatedActor,
        _: PolicyId,
    ) -> Result<Option<Policy>, Report<GetPoliciesError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn query_policies(
        &self,
        _: AuthenticatedActor,
        _: &PolicyFilter,
    ) -> Result<Vec<Policy>, Report<GetPoliciesError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    fn resolve_policies_for_actor(
        &self,
        _: AuthenticatedActor,
        params: ResolvePoliciesParams<'_>,
    ) -> impl Future<Output = Result<Vec<ResolvedPolicy>, Report<GetPoliciesError>>> {
        assert!(
            params.actions.contains(&ActionName::ViewEntity),
            "MockStore expects ViewEntity action",
        );

        future::ready(Ok(self.policies.iter().map(|policy| (policy)()).collect()))
    }

    async fn update_policy_by_id(
        &mut self,
        _: AuthenticatedActor,
        _: PolicyId,
        _: &[PolicyUpdateOperation],
    ) -> Result<Policy, Report<UpdatePolicyError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn archive_policy_by_id(
        &mut self,
        _: AuthenticatedActor,
        _: PolicyId,
    ) -> Result<(), Report<RemovePolicyError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn delete_policy_by_id(
        &mut self,
        _: AuthenticatedActor,
        _: PolicyId,
    ) -> Result<(), Report<RemovePolicyError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn seed_system_policies(&mut self) -> Result<(), Report<EnsureSystemPoliciesError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn build_entity_type_context(
        &self,
        _: &[&VersionedUrl],
    ) -> Result<Vec<EntityTypeResource<'_>>, Report<[BuildEntityTypeContextError]>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn build_property_type_context(
        &self,
        _: &[&VersionedUrl],
    ) -> Result<Vec<PropertyTypeResource<'_>>, Report<[BuildPropertyTypeContextError]>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn build_data_type_context(
        &self,
        _: &[&VersionedUrl],
    ) -> Result<Vec<DataTypeResource<'_>>, Report<[BuildDataTypeContextError]>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn build_entity_context(
        &self,
        _: &[EntityEditionId],
    ) -> Result<Vec<EntityResource<'static>>, Report<[BuildEntityContextError]>> {
        unimplemented!("not needed for authorization expression tests")
    }
}

impl<F> PrincipalStore for MockStore<F>
where
    F: Send + Sync,
{
    async fn get_or_create_system_machine(
        &mut self,
        _: &str,
    ) -> Result<MachineId, Report<GetSystemAccountError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn create_web(
        &mut self,
        _: ActorId,
        _: CreateWebParameter,
    ) -> Result<CreateWebResponse, Report<WebCreationError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn get_web_roles(
        &mut self,
        _: ActorEntityUuid,
        _: WebId,
    ) -> Result<std::collections::HashMap<WebRoleId, WebRole>, Report<WebRoleError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn get_team_roles(
        &mut self,
        _: ActorEntityUuid,
        _: TeamId,
    ) -> Result<std::collections::HashMap<TeamRoleId, TeamRole>, Report<TeamRoleError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn assign_role(
        &mut self,
        _: ActorEntityUuid,
        _: ActorEntityUuid,
        _: ActorGroupEntityUuid,
        _: RoleName,
    ) -> Result<RoleAssignmentStatus, Report<RoleAssignmentError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn get_actor_group_role(
        &mut self,
        _: ActorEntityUuid,
        _: ActorGroupEntityUuid,
    ) -> Result<Option<RoleName>, Report<RoleAssignmentError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn get_role_assignments(
        &mut self,
        _: ActorGroupEntityUuid,
        _: RoleName,
    ) -> Result<Vec<ActorEntityUuid>, Report<RoleAssignmentError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    async fn unassign_role(
        &mut self,
        _: ActorEntityUuid,
        _: ActorEntityUuid,
        _: ActorGroupEntityUuid,
        _: RoleName,
    ) -> Result<RoleUnassignmentStatus, Report<RoleAssignmentError>> {
        unimplemented!("not needed for authorization expression tests")
    }

    fn determine_actor(
        &self,
        actor_entity_uuid: ActorEntityUuid,
    ) -> impl Future<Output = Result<Option<ActorId>, Report<DetermineActorError>>> {
        let expected = self
            .actor_id
            .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from);
        assert_eq!(
            actor_entity_uuid, expected,
            "MockStore received unexpected actor UUID",
        );

        future::ready(Ok(self.actor_id))
    }

    fn build_principal_context(
        &self,
        actor_id: ActorId,
        context_builder: &mut ContextBuilder,
    ) -> impl Future<Output = Result<(), Report<BuildPrincipalContextError>>> {
        assert_eq!(
            Some(actor_id),
            self.actor_id,
            "MockStore received unexpected actor in build_principal_context",
        );
        if self.is_instance_admin {
            use type_system::principal::actor_group::{ActorGroup, Team};

            context_builder.add_actor_group(&ActorGroup::Team(Team {
                id: TeamId::new(Uuid::nil()),
                name: "instance-admins".to_owned(),
                parent_id: ActorGroupId::Web(WebId::new(Uuid::nil())),
                roles: HashSet::new(),
            }));
        }

        future::ready(Ok(()))
    }
}

pub(crate) const ACTOR_UUID: Uuid = Uuid::from_u128(0xAAAA_AAAA_AAAA_AAAA_AAAA_AAAA_AAAA_AAAA);
pub(crate) const ENTITY_UUID_1: Uuid = Uuid::from_u128(0x1111_1111_1111_1111_1111_1111_1111_1111);
pub(crate) const ENTITY_UUID_2: Uuid = Uuid::from_u128(0x2222_2222_2222_2222_2222_2222_2222_2222);
pub(crate) const WEB_UUID_1: Uuid = Uuid::from_u128(0x3333_3333_3333_3333_3333_3333_3333_3333);

pub(crate) fn policy_components(
    actor_id: Option<ActorId>,
    policies: Vec<Box<dyn Fn() -> ResolvedPolicy + Send + Sync>>,
) -> PolicyComponents {
    let store = MockStore {
        actor_id,
        is_instance_admin: false,
        policies,
    };

    let actor = actor_id.map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from);

    futures_lite::future::block_on(
        PolicyComponents::builder(&store)
            .with_actor(actor)
            .with_action(ActionName::ViewEntity, MergePolicies::Yes)
            .into_future(),
    )
    .expect("mock store should not fail")
}

const PERMIT_POLICY_UUID: Uuid = Uuid::from_u128(0xBBBB_BBBB_BBBB_BBBB_BBBB_BBBB_BBBB_BBBB);
const FORBID_POLICY_UUID: Uuid = Uuid::from_u128(0xCCCC_CCCC_CCCC_CCCC_CCCC_CCCC_CCCC_CCCC);

pub(crate) fn permit<'resource>(
    resource: impl Fn() -> Option<ResourceConstraint> + Send + Sync + 'resource,
) -> Box<dyn Fn() -> ResolvedPolicy + Send + Sync + 'resource> {
    Box::new(move || ResolvedPolicy {
        original_policy_id: PolicyId::new(PERMIT_POLICY_UUID),
        effect: Effect::Permit,
        actions: vec![ActionName::ViewEntity],
        resource: (resource)(),
    })
}

pub(crate) fn forbid<'resource>(
    resource: impl Fn() -> Option<ResourceConstraint> + Send + Sync + 'resource,
) -> Box<dyn Fn() -> ResolvedPolicy + Send + Sync + 'resource> {
    Box::new(move || ResolvedPolicy {
        original_policy_id: PolicyId::new(FORBID_POLICY_UUID),
        effect: Effect::Forbid,
        actions: vec![ActionName::ViewEntity],
        resource: (resource)(),
    })
}

pub(crate) fn policy_components_admin(
    actor_id: Option<ActorId>,
    policies: Vec<Box<dyn Fn() -> ResolvedPolicy + Send + Sync>>,
) -> PolicyComponents {
    let store = MockStore {
        actor_id,
        is_instance_admin: true,
        policies,
    };

    let actor = actor_id.map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from);

    futures_lite::future::block_on(
        PolicyComponents::builder(&store)
            .with_actor(actor)
            .with_action(ActionName::ViewEntity, MergePolicies::Yes)
            .into_future(),
    )
    .expect("mock store should not fail")
}

pub(crate) fn make_url(base: &str, version: u32) -> VersionedUrl {
    VersionedUrl {
        base_url: BaseUrl::new(base.to_owned()).expect("valid base URL"),
        version: OntologyTypeVersion {
            major: version,
            pre_release: None,
        },
    }
}
