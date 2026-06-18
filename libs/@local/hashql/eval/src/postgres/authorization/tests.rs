//! Mock store for authorization unit tests.
//!
//! Returns pre-configured policies without requiring a database connection.

use alloc::alloc::Global;
use core::{fmt::Write as _, future};
use std::{collections::HashSet, path::PathBuf};

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
use hash_graph_store::filter::{
    Parameter,
    protection::{
        PropertyFilter, PropertyFilterEntityQueryPath, PropertyFilterExpression,
        PropertyFilterExpressionList, PropertyProtectionFilterConfig,
    },
};
use hashql_core::{
    heap::Heap, module::std_lib::graph::types::knowledge::entity as entity_types, symbol::sym,
    r#type::environment::Environment,
};
use hashql_mir::{
    body::{basic_block::BasicBlockId, local::Local, terminator::GraphReadBody},
    builder::body,
    intern::Interner,
};
use insta::{Settings, assert_snapshot};
use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityUuid},
    ontology::{BaseUrl, VersionedUrl, id::OntologyTypeVersion},
    principal::{
        actor::{ActorEntityUuid, ActorId, MachineId, UserId},
        actor_group::{ActorGroupEntityUuid, ActorGroupId, TeamId, WebId},
        role::{RoleName, TeamRole, TeamRoleId, WebRole, WebRoleId},
    },
};
use uuid::Uuid;

use super::{policy::PolicyTranslationUnit, protection::ProtectionTranslationUnit};
use crate::{
    context::CodeGenerationContext,
    postgres::{
        AuthorizationPatch, Parameters, PostgresCompiler, PreparedQueryPatch,
        parameters::AuxiliaryParameters,
        projections::{AuxiliaryProjections, Projections},
        tests::{CompilationFixture, format_body, lint_sql},
    },
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

fn compile_and_patch<'heap>(
    fixture: &CompilationFixture<'heap>,
    heap: &'heap Heap,
    policy: &hash_graph_authorization::policies::PolicyComponents,
    properties: &PropertyProtectionFilterConfig<'_>,
) -> String {
    let mut scratch = hashql_core::heap::Scratch::new();
    let def = fixture.def();

    let mut context = CodeGenerationContext::new_in(
        &fixture.env,
        &fixture.interner,
        &fixture.bodies,
        &fixture.execution,
        heap,
        &mut scratch,
    );

    let mut filters = hashql_core::heap::Vec::new_in(heap);
    filters.push(GraphReadBody::Filter(def, Local::ENV));

    let read = hashql_mir::body::terminator::GraphRead {
        head: hashql_mir::body::terminator::GraphReadHead::Entity {
            axis: hashql_mir::body::operand::Operand::Place(hashql_mir::body::place::Place::local(
                Local::ENV,
            )),
        },
        body: filters,
        tail: hashql_mir::body::terminator::GraphReadTail::Collect,
        target: BasicBlockId::START,
    };

    let mut prepared_query = {
        let mut compiler = PostgresCompiler::new_in(&mut context, &mut scratch);
        compiler.compile_graph_read(&read)
    };

    assert!(
        context.diagnostics.is_empty(),
        "unexpected diagnostics from compilation",
    );

    let mut patch = PreparedQueryPatch::new().layer(AuthorizationPatch::new(policy, properties));
    patch.apply(&mut prepared_query, Global);

    let body = format_body(fixture, heap);
    let sql = lint_sql(&prepared_query.transpile().to_string());
    let compiled_params = format!("{}", prepared_query.parameters);
    let auxiliary_params = format!("{:?}", prepared_query.auxiliary_parameters);

    let mut output = String::new();
    writeln!(output, "{:=^80}\n", " MIR ").expect("write to String");
    write!(output, "{body}").expect("write to String");
    writeln!(output, "\n{:=^80}\n", " SQL ").expect("write to String");
    write!(output, "{sql}").expect("write to String");
    if !compiled_params.is_empty() {
        writeln!(output, "\n{:=^80}\n", " Compiled Parameters ").expect("write to String");
        write!(output, "{compiled_params}").expect("write to String");
    }
    writeln!(output, "\n{:=^80}\n", " Auxiliary Parameters ").expect("write to String");
    write!(output, "{auxiliary_params}").expect("write to String");
    output
}

fn snapshot_settings() -> Settings {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(manifest_dir.join("tests/ui/postgres/authorization/integration"));
    settings.set_prepend_module_to_snapshot(false);
    settings
}

/// Compiles a property-accessing filter, then applies authorization with
/// constrained permits, forbids, and property protection masking.
#[test]
fn patch_with_policy_and_protection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (|r#type| entity_types::types::entity(r#type, r#type.unknown(), None)),
             field_val: ?, input_val: ?, result: Bool;
        @proj v_props = vertex.properties: ?,
              v_name = v_props.name: ?;

        bb0() {
            field_val = load v_name;
            input_val = input.load! "expected";
            result = bin.== field_val input_val;
            return result;
        }
    });

    let compilation = CompilationFixture::new(&heap, env, body);

    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policy = policy_components(
        actor,
        vec![
            permit(|| {
                Some(
                        hash_graph_authorization::policies::resource::ResourceConstraint::Entity(
                            hash_graph_authorization::policies::resource::EntityResourceConstraint::Exact {
                                id: EntityUuid::new(ENTITY_UUID_1),
                            },
                        ),
                    )
            }),
            permit(|| {
                Some(
                    hash_graph_authorization::policies::resource::ResourceConstraint::Web {
                        web_id: WebId::new(WEB_UUID_1),
                    },
                )
            }),
            forbid(|| {
                Some(
                        hash_graph_authorization::policies::resource::ResourceConstraint::Entity(
                            hash_graph_authorization::policies::resource::EntityResourceConstraint::Any {
                                filter: hash_graph_authorization::policies::resource::EntityResourceFilter::IsOfType {
                                    entity_type: make_url(
                                        "https://hash.ai/@h/types/entity-type/restricted/",
                                        1,
                                    ),
                                },
                            },
                        ),
                    )
            }),
        ],
    );

    let mut properties = PropertyProtectionFilterConfig::new();
    properties.protect_property(
        BaseUrl::new("https://hash.ai/@h/types/property-type/email/".to_owned())
            .expect("valid base URL"),
        PropertyFilter::Equal(
            PropertyFilterExpression::Path {
                path: PropertyFilterEntityQueryPath::Uuid,
            },
            PropertyFilterExpression::ActorId,
        ),
    );

    let report = compile_and_patch(&compilation, &heap, &policy, &properties);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("patch_with_policy_and_protection", report);
}

/// Blank permit with no protection produces minimal changes:
/// WHERE gets TRUE, no property masking, no auxiliary joins.
#[test]
fn patch_blank_permit_no_protection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             result: Bool;

        bb0() {
            result = input.load! "flag";
            return result;
        }
    });

    let compilation = CompilationFixture::new(&heap, env, body);

    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policy = policy_components(actor, vec![permit(|| None)]);
    let properties = PropertyProtectionFilterConfig::new();

    let report = compile_and_patch(&compilation, &heap, &policy, &properties);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("patch_blank_permit_no_protection", report);
}

/// Blank forbid produces FALSE in WHERE regardless of other policies.
/// Protection masking still applies as defense-in-depth.
#[test]
fn patch_blank_forbid_denies_all() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (|r#type| entity_types::types::entity(r#type, r#type.unknown(), None)),
             field_val: ?, input_val: ?, result: Bool;
        @proj v_props = vertex.properties: ?,
              v_name = v_props.name: ?;

        bb0() {
            field_val = load v_name;
            input_val = input.load! "expected";
            result = bin.== field_val input_val;
            return result;
        }
    });

    let compilation = CompilationFixture::new(&heap, env, body);

    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policy = policy_components(actor, vec![forbid(|| None)]);
    let properties = PropertyProtectionFilterConfig::hash_default();

    let report = compile_and_patch(&compilation, &heap, &policy, &properties);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("patch_blank_forbid_denies_all", report);
}

/// Instance admin bypasses property protection entirely, even with
/// a non-empty protection config.
#[test]
fn patch_instance_admin_bypasses_protection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (|r#type| entity_types::types::entity(r#type, r#type.unknown(), None)),
             field_val: ?, input_val: ?, result: Bool;
        @proj v_props = vertex.properties: ?,
              v_name = v_props.name: ?;

        bb0() {
            field_val = load v_name;
            input_val = input.load! "expected";
            result = bin.== field_val input_val;
            return result;
        }
    });

    let compilation = CompilationFixture::new(&heap, env, body);

    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policy = policy_components_admin(actor, vec![permit(|| None)]);
    let properties = PropertyProtectionFilterConfig::hash_default();

    let report = compile_and_patch(&compilation, &heap, &policy, &properties);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("patch_instance_admin_bypasses_protection", report);
}

/// Protection filter that references `TypeBaseUrls`, requiring the
/// `entity_is_of_type_ids` auxiliary join to be in scope inside the
/// `entity_editions` LATERAL mask expression.
#[test]
fn patch_protection_with_type_base_urls() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (|r#type| entity_types::types::entity(r#type, r#type.unknown(), None)),
             field_val: ?, input_val: ?, result: Bool;
        @proj v_props = vertex.properties: ?,
              v_name = v_props.name: ?;

        bb0() {
            field_val = load v_name;
            input_val = input.load! "expected";
            result = bin.== field_val input_val;
            return result;
        }
    });

    let compilation = CompilationFixture::new(&heap, env, body);

    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policy = policy_components(actor, vec![permit(|| None)]);

    // Protection uses TypeBaseUrls path, which demands entity_is_of_type_ids join.
    let mut properties = PropertyProtectionFilterConfig::new();
    properties.protect_property(
        BaseUrl::new("https://hash.ai/@h/types/property-type/email/".to_owned())
            .expect("valid base URL"),
        PropertyFilter::In(
            PropertyFilterExpression::Parameter {
                parameter: Parameter::Text(alloc::borrow::Cow::Borrowed(
                    "https://hash.ai/@h/types/entity-type/user/",
                )),
            },
            PropertyFilterExpressionList::Path {
                path: PropertyFilterEntityQueryPath::TypeBaseUrls,
            },
        ),
    );

    let report = compile_and_patch(&compilation, &heap, &policy, &properties);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("patch_protection_with_type_base_urls", report);
}
