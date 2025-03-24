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
    Authorized, ContextBuilder, PartialResourceId, PolicySet, Request, RequestContext,
    action::ActionId,
    principal::{
        ActorId,
        machine::MachineId,
        role::RoleId,
        team::{TeamId, TeamRoleId},
        user::UserId,
        web::WebRoleId,
    },
    resource::{EntityResource, EntityTypeId, EntityTypeResource},
    store::{MemoryPolicyStore, PolicyStore},
};
use type_system::{knowledge::entity::id::EntityUuid, ontology::VersionedUrl, web::OwnedById};
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
        policy_store: &mut impl PolicyStore,
        context: &mut ContextBuilder,
    ) -> Result<Self, Box<dyn Error>> {
        let web_id = policy_store.create_web()?;
        let admin_role = policy_store.create_web_role(web_id)?;
        let member_role = policy_store.create_web_role(web_id)?;

        let machine = TestMachine::generate(web_id, policy_store, context)?;
        policy_store
            .assign_role(ActorId::Machine(machine.id), RoleId::Web(member_role))
            .expect("should be able to assign role");

        for policy in permit_admin_web(web_id, admin_role) {
            policy_store.store_policy(policy)?;
        }
        for policy in permit_member_crud_web(web_id, member_role) {
            policy_store.store_policy(policy)?;
        }

        Ok(Self {
            id: web_id,
            admin_role,
            member_role,
            machine,
        })
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
        policy_store: &mut impl PolicyStore,
        context: &mut ContextBuilder,
    ) -> Result<Self, Box<dyn Error>> {
        static ENTITY_TYPES: LazyLock<[VersionedUrl; 2]> = LazyLock::new(|| {
            [
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/user/v/6")
                    .expect("should be a valid URL"),
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")
                    .expect("should be a valid URL"),
            ]
        });

        let web = TestWeb::generate(policy_store, context)?;
        let id = policy_store.create_user(web.id)?;
        let entity = EntityResource {
            id: EntityUuid::new(id.into_uuid()),
            web_id: web.id,
            entity_type: Cow::Borrowed(ENTITY_TYPES.as_slice()),
        };

        policy_store
            .assign_role(ActorId::User(id), RoleId::Web(web.admin_role))
            .expect("should be able to assign role");
        context.add_entity(&entity);

        Ok(Self { web, id, entity })
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
        policy_store: &mut impl PolicyStore,
        context: &mut ContextBuilder,
    ) -> Result<Self, Box<dyn Error>> {
        static ENTITY_TYPES: LazyLock<[VersionedUrl; 2]> = LazyLock::new(|| {
            [
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/machine/v/2")
                    .expect("should be a valid URL"),
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")
                    .expect("should be a valid URL"),
            ]
        });

        let id = policy_store.create_machine(web_id)?;
        let entity = EntityResource {
            id: EntityUuid::new(id.into_uuid()),
            web_id,
            entity_type: Cow::Borrowed(ENTITY_TYPES.as_slice()),
        };

        context.add_entity(&entity);

        Ok(Self { id, entity })
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
        policy_store: &mut impl PolicyStore,
        context: &mut ContextBuilder,
    ) -> Result<Self, Box<dyn Error>> {
        let web = TestWeb::generate(policy_store, context)?;
        for policy in permit_view_system_entities(web.id)
            .into_iter()
            .chain(forbid_update_web_machine())
            .chain(permit_view_ontology())
        {
            policy_store.store_policy(policy)?;
        }

        let machine = TestMachine::generate(web.id, policy_store, context)?;
        policy_store.assign_role(ActorId::Machine(machine.id), RoleId::Web(web.admin_role))?;
        for policy in permit_instantiate(machine.id) {
            policy_store.store_policy(policy)?;
        }

        let hash_ai_machine = TestMachine::generate(web.id, policy_store, context)?;

        let hash_instance_admins = policy_store.create_team()?;
        let hash_instance_admins_admin_role =
            policy_store.create_team_role(hash_instance_admins)?;
        let hash_instance_admins_member_role =
            policy_store.create_team_role(hash_instance_admins)?;

        policy_store
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
        for policy in permit_hash_instance_admins(hash_instance_admins, hash_instance_entity.id) {
            policy_store.store_policy(policy)?;
        }

        Ok(Self {
            web,
            machine,
            hash_ai_machine,
            hash_instance_admins,
            hash_instance_admins_admin_role,
            hash_instance_admins_member_role,
            hash_instance_entity,
        })
    }
}

#[test]
fn instantiate() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut policy_store = MemoryPolicyStore::default();

    let system = TestSystem::generate(&mut policy_store, &mut context)?;

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

    policy_store.extend_context(&mut context, ActorId::Machine(system.machine.id))?;
    policy_store.extend_context(&mut context, ActorId::Machine(system.hash_ai_machine.id))?;
    let context = context.build()?;

    let system_machine_policy_set = PolicySet::default()
        .with_policies(policy_store.get_policies(ActorId::Machine(system.machine.id))?)?;
    println!("system_machine_policy_set:\n{system_machine_policy_set:?}");

    let system_web_machine_policy_set = PolicySet::default()
        .with_policies(policy_store.get_policies(ActorId::Machine(system.web.machine.id))?)?;
    println!("system_web_machine_policy_set:\n{system_web_machine_policy_set:?}");

    // Only the system machine can instantiate a machine
    assert!(matches!(
        system_web_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(system.web.machine.id),
                action: ActionId::Instantiate,
                resource: Some(&PartialResourceId::EntityType(Some(Cow::Borrowed(
                    &machine_type.id
                )))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    ));
    assert!(matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(system.machine.id),
                action: ActionId::Instantiate,
                resource: Some(&PartialResourceId::EntityType(Some(Cow::Borrowed(
                    &machine_type.id
                )))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));

    assert!(matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(system.machine.id),
                action: ActionId::Instantiate,
                resource: Some(&PartialResourceId::EntityType(Some(Cow::Borrowed(
                    &document_type.id
                )))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(system.machine.id),
                action: ActionId::Instantiate,
                resource: Some(&PartialResourceId::EntityType(Some(Cow::Borrowed(
                    &document_type.id
                )))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));

    Ok(())
}

#[test]
#[expect(
    clippy::too_many_lines,
    reason = "Mostly asserting the correct policies are applied"
)]
fn user_web_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut policy_store = MemoryPolicyStore::default();

    let system = TestSystem::generate(&mut policy_store, &mut context)?;

    let user = TestUser::generate(&mut policy_store, &mut context)?;

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

    policy_store.extend_context(&mut context, ActorId::User(user.id))?;
    policy_store.extend_context(&mut context, ActorId::Machine(user.web.machine.id))?;
    let context = context.build()?;

    let user_policy_set =
        PolicySet::default().with_policies(policy_store.get_policies(ActorId::User(user.id))?)?;
    println!("user_policy_set:\n{user_policy_set:?}");

    let user_machine_policy_set = PolicySet::default()
        .with_policies(policy_store.get_policies(ActorId::Machine(user.web.machine.id))?)?;
    println!("user_machine_policy_set:\n{user_machine_policy_set:?}");

    eprintln!("context:\n{context:?}");

    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::Instantiate,
                resource: Some(&PartialResourceId::EntityType(Some(Cow::Borrowed(
                    &machine_type.id
                )))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    ));
    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::Instantiate,
                resource: Some(&PartialResourceId::EntityType(Some(Cow::Borrowed(
                    &document_type.id
                )))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::Instantiate,
                resource: Some(&PartialResourceId::EntityType(Some(Cow::Borrowed(
                    &web_type.id
                )))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));

    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        user_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(user.web.machine.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        user_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(system.machine.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    ));

    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::Update,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        user_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(user.web.machine.id),
                action: ActionId::Update,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        user_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(system.machine.id),
                action: ActionId::Update,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    ));

    Ok(())
}

#[test]
#[expect(
    clippy::too_many_lines,
    reason = "Mostly asserting the correct policies are applied"
)]
fn org_web_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut policy_store = MemoryPolicyStore::default();

    let system = TestSystem::generate(&mut policy_store, &mut context)?;

    let org_web = TestWeb::generate(&mut policy_store, &mut context)?;
    let org_machine_id = policy_store.create_machine(org_web.id)?;
    policy_store.assign_role(
        ActorId::Machine(org_machine_id),
        RoleId::Web(org_web.admin_role),
    )?;

    let user = TestUser::generate(&mut policy_store, &mut context)?;
    policy_store.assign_role(ActorId::User(user.id), RoleId::Web(org_web.admin_role))?;

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

    policy_store.extend_context(&mut context, ActorId::User(user.id))?;
    policy_store.extend_context(&mut context, ActorId::Machine(user.web.machine.id))?;
    policy_store.extend_context(&mut context, ActorId::Machine(org_web.machine.id))?;
    let context = context.build()?;

    let org_machine_policy_set = PolicySet::default()
        .with_policies(policy_store.get_policies(ActorId::Machine(org_web.machine.id))?)?;
    println!("org_machine_policy_set:\n{org_machine_policy_set:?}");

    let user_policy_set =
        PolicySet::default().with_policies(policy_store.get_policies(ActorId::User(user.id))?)?;
    println!("user_policy_set:\n{user_policy_set:?}");

    let user_machine_policy_set = PolicySet::default()
        .with_policies(policy_store.get_policies(ActorId::Machine(user.web.machine.id))?)?;
    println!("user_machine_policy_set:\n{user_machine_policy_set:?}");

    let system_machine_policy_set = PolicySet::default()
        .with_policies(policy_store.get_policies(ActorId::Machine(system.machine.id))?)?;
    println!("system_machine_policy_set:\n{system_machine_policy_set:?}");

    assert!(matches!(
        org_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(org_web.machine.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(EntityUuid::new(
                    user.web.machine.id.into_uuid()
                )))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));

    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        org_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(org_web.machine.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(user.web.machine.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    ));
    assert!(matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(system.web.machine.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    ));

    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::Update,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        org_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(org_web.machine.id),
                action: ActionId::Update,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        user_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(user.web.machine.id),
                action: ActionId::Update,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    ));
    assert!(matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: ActorId::Machine(system.web.machine.id),
                action: ActionId::Update,
                resource: Some(&PartialResourceId::Entity(Some(web_entity.id))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    ));

    Ok(())
}

#[test]
fn instance_admin_without_access_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut policy_store = MemoryPolicyStore::default();

    let system = TestSystem::generate(&mut policy_store, &mut context)?;

    let user = TestUser::generate(&mut policy_store, &mut context)?;
    println!("user: {user:?}");

    policy_store.extend_context(&mut context, ActorId::User(user.id))?;
    let context = context.build()?;

    let user_policy_set =
        PolicySet::default().with_policies(policy_store.get_policies(ActorId::User(user.id))?)?;
    println!("user_policy_set:\n{user_policy_set:?}");

    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(
                    system.hash_instance_entity.id
                ))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::Update,
                resource: Some(&PartialResourceId::Entity(Some(
                    system.hash_instance_entity.id
                ))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    ));

    Ok(())
}

#[test]
fn instance_admin_with_access_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut policy_store = MemoryPolicyStore::default();

    let system = TestSystem::generate(&mut policy_store, &mut context)?;

    let user = TestUser::generate(&mut policy_store, &mut context)?;
    policy_store.assign_role(
        ActorId::User(user.id),
        RoleId::Team(system.hash_instance_admins_admin_role),
    )?;

    policy_store.extend_context(&mut context, ActorId::User(user.id))?;
    let context = context.build()?;

    let user_policy_set =
        PolicySet::default().with_policies(policy_store.get_policies(ActorId::User(user.id))?)?;
    println!("user_policy_set:\n{user_policy_set:?}");

    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::View,
                resource: Some(&PartialResourceId::Entity(Some(
                    system.hash_instance_entity.id
                ))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));
    assert!(matches!(
        user_policy_set.evaluate(
            &Request {
                actor: ActorId::User(user.id),
                action: ActionId::Update,
                resource: Some(&PartialResourceId::Entity(Some(
                    system.hash_instance_entity.id
                ))),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    ));

    Ok(())
}

#[test]
fn partial_resource_evaluation() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut policy_store = MemoryPolicyStore::default();

    let system = TestSystem::generate(&mut policy_store, &mut context)?;

    let user = TestUser::generate(&mut policy_store, &mut context)?;
    policy_store.assign_role(
        ActorId::User(user.id),
        RoleId::Team(system.hash_instance_admins_admin_role),
    )?;

    policy_store.extend_context(&mut context, ActorId::User(user.id))?;
    let context = context.build()?;

    let user_policy_set =
        PolicySet::default().with_policies(policy_store.get_policies(ActorId::User(user.id))?)?;
    println!("user_policy_set:\n{user_policy_set:?}");

    match user_policy_set.evaluate(
        &Request {
            actor: ActorId::User(user.id),
            action: ActionId::Instantiate,
            resource: Some(&PartialResourceId::EntityType(None)),
            context: RequestContext::default(),
        },
        &context,
    )? {
        Authorized::Partial(expr) => {
            println!("expr:\n{expr:#?}");
        }
        Authorized::Always => panic!("expected partial evaluation, got always"),
        Authorized::Never => panic!("expected partial evaluation, got never"),
    }

    Ok(())
}
