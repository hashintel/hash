#![expect(
    clippy::panic_in_result_fn,
    reason = "Tests use assertions that may panic"
)]

extern crate alloc;

mod definitions;

use alloc::borrow::Cow;
use core::{error::Error, str::FromStr as _};
use std::sync::LazyLock;

use hash_graph_authorization::policies::{
    ContextBuilder, Policy, PolicySet, Request, RequestContext,
    action::ActionId,
    principal::{
        ActorId,
        machine::MachineId,
        role::RoleId,
        team::{TeamId, TeamRoleId},
        user::UserId,
        web::WebRoleId,
    },
    resource::{EntityResource, EntityTypeId, EntityTypeResource, ResourceId},
    store::{MemoryPrincipalStore, PrincipalStore},
};
use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
use type_system::url::VersionedUrl;
use uuid::Uuid;

use self::definitions::{
    forbid_update_web_machine, permit_admin_web, permit_hash_instance_admins, permit_instantiate,
    permit_member_crud_web, permit_view_ontology, permit_view_system_entities,
};

#[derive(Debug, serde::Serialize)]
struct TestWeb {
    id: OwnedById,
    admin_role: WebRoleId,
    member_role: WebRoleId,
    machine: TestMachine,
}

impl TestWeb {
    fn generate(
        principal_store: &mut impl PrincipalStore,
        context: &mut ContextBuilder,
    ) -> (Self, Vec<Policy>) {
        let web_id = principal_store.create_web();
        let admin_role = principal_store.create_web_role(web_id);
        let member_role = principal_store.create_web_role(web_id);

        let machine = TestMachine::generate(web_id, principal_store, context);
        principal_store
            .assign_role(ActorId::Machine(machine.id), RoleId::Web(member_role))
            .expect("should be able to assign role");

        let mut policies = permit_admin_web(web_id, admin_role);
        policies.extend(permit_member_crud_web(web_id, member_role));

        (
            Self {
                id: web_id,
                admin_role,
                member_role,
                machine,
            },
            policies,
        )
    }
}

#[derive(Debug, serde::Serialize)]
struct TestUser {
    web: TestWeb,
    id: UserId,
    entity: EntityResource<'static>,
}

impl TestUser {
    fn generate(
        principal_store: &mut impl PrincipalStore,
        context: &mut ContextBuilder,
    ) -> (Self, Vec<Policy>) {
        static ENTITY_TYPES: LazyLock<[VersionedUrl; 2]> = LazyLock::new(|| {
            [
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/user/v/6")
                    .expect("should be a valid URL"),
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")
                    .expect("should be a valid URL"),
            ]
        });

        let (web, policies) = TestWeb::generate(principal_store, context);
        let id = principal_store.create_user(web.id);
        let entity = EntityResource {
            id: EntityUuid::new(id.into_uuid()),
            web_id: web.id,
            entity_type: Cow::Borrowed(ENTITY_TYPES.as_slice()),
        };

        principal_store
            .assign_role(ActorId::User(id), RoleId::Web(web.admin_role))
            .expect("should be able to assign role");
        context.add_entity(&entity);

        (Self { web, id, entity }, policies)
    }
}

#[derive(Debug, serde::Serialize)]
struct TestMachine {
    id: MachineId,
    entity: EntityResource<'static>,
}

impl TestMachine {
    fn generate(
        web_id: OwnedById,
        principal_store: &mut impl PrincipalStore,
        context: &mut ContextBuilder,
    ) -> Self {
        static ENTITY_TYPES: LazyLock<[VersionedUrl; 2]> = LazyLock::new(|| {
            [
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/machine/v/2")
                    .expect("should be a valid URL"),
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")
                    .expect("should be a valid URL"),
            ]
        });

        let id = principal_store.create_machine(web_id);
        let entity = EntityResource {
            id: EntityUuid::new(id.into_uuid()),
            web_id,
            entity_type: Cow::Borrowed(ENTITY_TYPES.as_slice()),
        };

        context.add_entity(&entity);

        Self { id, entity }
    }
}

#[derive(Debug, serde::Serialize)]
struct TestSystem {
    web: TestWeb,
    machine: TestMachine,
    hash_ai_machine: TestMachine,
    hash_instance_admins: TeamId,
    hash_instance_admins_admin_role: TeamRoleId,
    hash_instance_admins_member_role: TeamRoleId,
    hash_instance_entity: EntityResource<'static>,
}

impl TestSystem {
    fn generate(
        principal_store: &mut impl PrincipalStore,
        context: &mut ContextBuilder,
    ) -> (Self, Vec<Policy>) {
        let (web, mut policies) = TestWeb::generate(principal_store, context);
        policies.extend(permit_view_system_entities(web.id));
        policies.extend(forbid_update_web_machine());
        policies.extend(permit_view_ontology());

        let machine = TestMachine::generate(web.id, principal_store, context);
        principal_store
            .assign_role(ActorId::Machine(machine.id), RoleId::Web(web.admin_role))
            .expect("should be able to assign role");
        policies.extend(permit_instantiate(machine.id));

        let hash_ai_machine = TestMachine::generate(web.id, principal_store, context);

        let hash_instance_admins = principal_store.create_team();
        let hash_instance_admins_admin_role =
            principal_store.create_team_role(hash_instance_admins);
        let hash_instance_admins_member_role =
            principal_store.create_team_role(hash_instance_admins);
        principal_store
            .assign_role(
                ActorId::Machine(hash_ai_machine.id),
                RoleId::Team(hash_instance_admins_admin_role),
            )
            .expect("should be able to assign role");
        let hash_instance_entity = EntityResource {
            web_id: web.id,
            id: EntityUuid::new(Uuid::new_v4()),
            entity_type: Cow::Owned(vec![
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/hash-instance/v/1")
                    .expect("should be a valid URL"),
            ]),
        };
        context.add_entity(&hash_instance_entity);
        policies.extend(permit_hash_instance_admins(
            hash_instance_admins_admin_role,
            hash_instance_admins_member_role,
            hash_instance_entity.id,
        ));

        (
            Self {
                web,
                machine,
                hash_ai_machine,
                hash_instance_admins,
                hash_instance_admins_admin_role,
                hash_instance_admins_member_role,
                hash_instance_entity,
            },
            policies,
        )
    }
}

#[test]
fn instantiate() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut principal_store = MemoryPrincipalStore::default();

    let (system, system_policies) = TestSystem::generate(&mut principal_store, &mut context);

    let machine_type = EntityTypeResource {
        web_id: system.web.id,
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@h/types/entity-type/machine/v/2",
        )?)),
    };
    context.add_entity_type(&machine_type);

    let document_type = EntityTypeResource {
        web_id: system.web.id,
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@h/types/entity-type/document/v/1",
        )?)),
    };
    context.add_entity_type(&document_type);

    principal_store.extend_context(&mut context, ActorId::Machine(system.machine.id));
    principal_store.extend_context(&mut context, ActorId::Machine(system.hash_ai_machine.id));
    let context = context.build()?;
    let policy_set = PolicySet::default().with_policies(&system_policies)?;

    // Only the system machine can instantiate a machine
    assert!(!policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(system.web.machine.id),
            action: ActionId::Instantiate,
            resource: &ResourceId::EntityType(Cow::Borrowed(&machine_type.id)),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(system.machine.id),
            action: ActionId::Instantiate,
            resource: &ResourceId::EntityType(Cow::Borrowed(&machine_type.id)),
            context: RequestContext::default(),
        },
        &context,
    )?);

    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(system.machine.id),
            action: ActionId::Instantiate,
            resource: &ResourceId::EntityType(Cow::Borrowed(&document_type.id)),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(system.machine.id),
            action: ActionId::Instantiate,
            resource: &ResourceId::EntityType(Cow::Borrowed(&document_type.id)),
            context: RequestContext::default(),
        },
        &context,
    )?);

    Ok(())
}

#[test]
#[expect(
    clippy::too_many_lines,
    reason = "Mostly asserting the correct policies are applied"
)]
fn user_web_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut principal_store = MemoryPrincipalStore::default();

    let (system, system_policies) = TestSystem::generate(&mut principal_store, &mut context);

    let (user, user_policies) = TestUser::generate(&mut principal_store, &mut context);

    let machine_type = EntityTypeResource {
        web_id: system.web.id,
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@h/types/entity-type/machine/v/2",
        )?)),
    };
    context.add_entity_type(&machine_type);

    let document_type = EntityTypeResource {
        web_id: system.web.id,
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@h/types/entity-type/document/v/1",
        )?)),
    };
    context.add_entity_type(&document_type);

    let web_type = EntityTypeResource {
        web_id: user.web.id,
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@alice/types/entity-type/custom/v/1",
        )?)),
    };
    context.add_entity_type(&web_type);

    let web_entity = EntityResource {
        web_id: user.web.id,
        id: EntityUuid::new(Uuid::new_v4()),
        entity_type: Cow::Owned(vec![web_type.id.as_url().clone()]),
    };
    context.add_entity(&web_entity);

    principal_store.extend_context(&mut context, ActorId::User(user.id));
    principal_store.extend_context(&mut context, ActorId::Machine(user.web.machine.id));
    let context = context.build()?;

    let policy_set = PolicySet::default()
        .with_policies(&system_policies)?
        .with_policies(&user_policies)?;

    eprintln!("context:\n{context:?}\npolicies:\n{policy_set:?}");

    assert!(!policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::Instantiate,
            resource: &ResourceId::EntityType(Cow::Borrowed(&machine_type.id)),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::Instantiate,
            resource: &ResourceId::EntityType(Cow::Borrowed(&document_type.id)),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::Instantiate,
            resource: &ResourceId::EntityType(Cow::Borrowed(&web_type.id)),
            context: RequestContext::default(),
        },
        &context,
    )?);

    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(user.web.machine.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(!policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(system.machine.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);

    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::Update,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(user.web.machine.id),
            action: ActionId::Update,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(!policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(system.machine.id),
            action: ActionId::Update,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);

    Ok(())
}

#[test]
#[expect(
    clippy::too_many_lines,
    reason = "Mostly asserting the correct policies are applied"
)]
fn org_web_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut principal_store = MemoryPrincipalStore::default();

    let (system, system_policies) = TestSystem::generate(&mut principal_store, &mut context);

    let (org_web, org_web_policies) = TestWeb::generate(&mut principal_store, &mut context);
    let org_machine_id = principal_store.create_machine(org_web.id);
    principal_store.assign_role(
        ActorId::Machine(org_machine_id),
        RoleId::Web(org_web.admin_role),
    )?;

    let (user, user_policies) = TestUser::generate(&mut principal_store, &mut context);
    principal_store.assign_role(ActorId::User(user.id), RoleId::Web(org_web.admin_role))?;

    let web_type = EntityTypeResource {
        web_id: org_web.id,
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@alice/types/entity-type/custom/v/1",
        )?)),
    };
    context.add_entity_type(&web_type);

    let web_entity = EntityResource {
        web_id: org_web.id,
        id: EntityUuid::new(Uuid::new_v4()),
        entity_type: Cow::Owned(vec![web_type.id.as_url().clone()]),
    };
    context.add_entity(&web_entity);

    principal_store.extend_context(&mut context, ActorId::User(user.id));
    principal_store.extend_context(&mut context, ActorId::Machine(user.web.machine.id));
    principal_store.extend_context(&mut context, ActorId::Machine(org_web.machine.id));
    let context = context.build()?;
    let policy_set = PolicySet::default()
        .with_policies(&system_policies)?
        .with_policies(&org_web_policies)?
        .with_policies(&user_policies)?;

    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(org_web.machine.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(EntityUuid::new(user.web.machine.id.into_uuid())),
            context: RequestContext::default(),
        },
        &context,
    )?);

    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(org_web.machine.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(!policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(user.web.machine.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(!policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(system.web.machine.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);

    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::Update,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(org_web.machine.id),
            action: ActionId::Update,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(!policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(user.web.machine.id),
            action: ActionId::Update,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(!policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(system.web.machine.id),
            action: ActionId::Update,
            resource: &ResourceId::Entity(web_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);

    Ok(())
}

#[test]
fn instance_admin_without_access_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut principal_store = MemoryPrincipalStore::default();

    let (system, system_policies) = TestSystem::generate(&mut principal_store, &mut context);

    let (user, user_policies) = TestUser::generate(&mut principal_store, &mut context);
    println!("user: {user:?}");

    principal_store.extend_context(&mut context, ActorId::User(user.id));
    let context = context.build()?;
    let policy_set = PolicySet::default()
        .with_policies(&system_policies)?
        .with_policies(&user_policies)?;

    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(system.hash_instance_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(!policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::Update,
            resource: &ResourceId::Entity(system.hash_instance_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);

    Ok(())
}

#[test]
fn instance_admin_with_access_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut principal_store = MemoryPrincipalStore::default();

    let (system, system_policies) = TestSystem::generate(&mut principal_store, &mut context);

    let (user, user_policies) = TestUser::generate(&mut principal_store, &mut context);
    principal_store.assign_role(
        ActorId::User(user.id),
        RoleId::Team(system.hash_instance_admins_admin_role),
    )?;

    principal_store.extend_context(&mut context, ActorId::User(user.id));
    let context = context.build()?;
    let policy_set = PolicySet::default()
        .with_policies(&system_policies)?
        .with_policies(&user_policies)?;

    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(system.hash_instance_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);
    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::Update,
            resource: &ResourceId::Entity(system.hash_instance_entity.id),
            context: RequestContext::default(),
        },
        &context,
    )?);

    Ok(())
}
