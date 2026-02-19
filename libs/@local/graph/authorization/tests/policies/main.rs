extern crate alloc;

mod definitions;

use alloc::borrow::Cow;
use core::{assert_matches, error::Error, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use hash_graph_authorization::policies::{
    Authorized, ContextBuilder, PolicySet, Request, RequestContext, ResourceId,
    action::ActionName,
    resource::{EntityResource, EntityTypeId, EntityTypeResource},
    store::{MemoryPolicyStore, OldPolicyStore},
};
use type_system::{
    knowledge::entity::{EntityId, id::EntityUuid},
    ontology::{BaseUrl, VersionedUrl},
    principal::{
        actor::{ActorId, MachineId, UserId},
        actor_group::{ActorGroupId, WebId},
        role::{RoleId, RoleName, WebRoleId},
    },
};
use uuid::Uuid;

use self::definitions::{
    forbid_update_web_machine, permit_admin_web, permit_hash_instance_admins, permit_instantiate,
    permit_member_crud_web, permit_view_ontology, permit_view_system_entities,
};

#[derive(Debug, serde::Serialize)]
struct TestWeb {
    id: WebId,
    admin_role: WebRoleId,
    member_role: WebRoleId,
    machine: TestMachine,
}

impl TestWeb {
    fn generate(
        policy_store: &mut impl OldPolicyStore,
        context: &mut ContextBuilder,
        shortname: impl Into<String>,
    ) -> Result<Self, Box<dyn Error>> {
        let web_id = policy_store.create_web(Some(shortname.into()))?;
        let admin_role = policy_store.create_web_role(web_id, RoleName::Administrator)?;
        let member_role = policy_store.create_web_role(web_id, RoleName::Member)?;

        let machine =
            TestMachine::generate(web_id, policy_store, context, format!("system-{web_id}"))?;
        policy_store
            .assign_role(
                ActorId::Machine(machine.id),
                ActorGroupId::Web(web_id),
                RoleName::Member,
            )
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
        policy_store: &mut impl OldPolicyStore,
        context: &mut ContextBuilder,
        shortname: impl Into<String>,
    ) -> Result<Self, Box<dyn Error>> {
        static ENTITY_TYPES: LazyLock<[VersionedUrl; 2]> = LazyLock::new(|| {
            [
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/user/v/6")
                    .expect("should be a valid URL"),
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")
                    .expect("should be a valid URL"),
            ]
        });

        let web = TestWeb::generate(policy_store, context, shortname)?;
        let id = policy_store.create_user(web.id)?;
        let entity = EntityResource {
            id: EntityId {
                web_id: web.id,
                entity_uuid: id.into(),
                draft_id: None,
            },
            entity_types: Cow::Borrowed(ENTITY_TYPES.as_slice()),
            entity_base_types: Cow::Owned(
                ENTITY_TYPES
                    .iter()
                    .map(|url| url.base_url.clone())
                    .collect(),
            ),
            created_by: id.into(),
        };

        policy_store
            .assign_role(
                ActorId::User(id),
                ActorGroupId::Web(web.id),
                RoleName::Administrator,
            )
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
        web_id: WebId,
        policy_store: &mut impl OldPolicyStore,
        context: &mut ContextBuilder,
        name: impl Into<String>,
    ) -> Result<Self, Box<dyn Error>> {
        static ENTITY_TYPES: LazyLock<[VersionedUrl; 2]> = LazyLock::new(|| {
            [
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/machine/v/2")
                    .expect("should be a valid URL"),
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")
                    .expect("should be a valid URL"),
            ]
        });

        let id = policy_store.create_machine(name.into())?;
        let entity = EntityResource {
            id: EntityId {
                web_id,
                entity_uuid: id.into(),
                draft_id: None,
            },
            entity_types: Cow::Borrowed(ENTITY_TYPES.as_slice()),
            entity_base_types: Cow::Owned(
                ENTITY_TYPES
                    .iter()
                    .map(|url| url.base_url.clone())
                    .collect(),
            ),
            created_by: id.into(),
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
    hash_instance_admins: ActorGroupId,
    hash_instance_admins_admin_role: RoleId,
    hash_instance_admins_member_role: RoleId,
    hash_instance_entity: EntityResource<'static>,
}

impl TestSystem {
    fn generate(
        policy_store: &mut impl OldPolicyStore,
        context: &mut ContextBuilder,
    ) -> Result<Self, Box<dyn Error>> {
        let web = TestWeb::generate(policy_store, context, "h")?;
        for policy in permit_view_system_entities(web.id)
            .into_iter()
            .chain(forbid_update_web_machine())
            .chain(permit_view_ontology())
        {
            policy_store.store_policy(policy)?;
        }

        let machine = TestMachine::generate(web.id, policy_store, context, "h")?;
        policy_store.assign_role(
            ActorId::Machine(machine.id),
            ActorGroupId::Web(web.id),
            RoleName::Administrator,
        )?;
        for policy in permit_instantiate(machine.id) {
            policy_store.store_policy(policy)?;
        }

        let hash_ai_machine = TestMachine::generate(web.id, policy_store, context, "hash-ai")?;

        let hash_instance_admins =
            policy_store.create_team(ActorGroupId::Web(web.id), "instance-admins".to_owned())?;
        let hash_instance_admins_admin_role =
            policy_store.create_team_role(hash_instance_admins, RoleName::Administrator)?;
        let hash_instance_admins_member_role =
            policy_store.create_team_role(hash_instance_admins, RoleName::Member)?;

        policy_store
            .assign_role(
                ActorId::Machine(hash_ai_machine.id),
                ActorGroupId::Team(hash_instance_admins),
                RoleName::Administrator,
            )
            .expect("should be able to assign role");
        let hash_instance_entity = EntityResource {
            id: EntityId {
                web_id: web.id,
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
                draft_id: None,
            },
            entity_types: Cow::Owned(vec![
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/hash-instance/v/1")
                    .expect("should be a valid URL"),
            ]),
            entity_base_types: Cow::Owned(vec![
                BaseUrl::new("https://hash.ai/@h/types/entity-type/hash-instance/".to_owned())
                    .expect("should be a valid URL"),
            ]),
            created_by: machine.id.into(),
        };
        context.add_entity(&hash_instance_entity);
        for policy in permit_hash_instance_admins(hash_instance_admins, hash_instance_entity.id) {
            policy_store.store_policy(policy)?;
        }

        Ok(Self {
            web,
            machine,
            hash_ai_machine,
            hash_instance_admins: ActorGroupId::Team(hash_instance_admins),
            hash_instance_admins_admin_role: RoleId::Team(hash_instance_admins_admin_role),
            hash_instance_admins_member_role: RoleId::Team(hash_instance_admins_member_role),
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
        web_id: Some(system.web.id),
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@h/types/entity-type/machine/v/2",
        )?)),
    };
    context.add_entity_type(&machine_type);

    let document_type = EntityTypeResource {
        web_id: Some(system.web.id),
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@h/types/entity-type/document/v/1",
        )?)),
    };
    context.add_entity_type(&document_type);

    policy_store.extend_context(&mut context, ActorId::Machine(system.machine.id))?;
    policy_store.extend_context(&mut context, ActorId::Machine(system.hash_ai_machine.id))?;
    let context = context.build()?;

    let system_machine_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::Instantiate]))
        .with_policies(policy_store.get_policies(ActorId::Machine(system.machine.id))?)?;
    println!("system_machine_policy_set:\n{system_machine_policy_set:?}");

    let system_web_machine_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::Instantiate]))
        .with_policies(policy_store.get_policies(ActorId::Machine(system.web.machine.id))?)?;
    println!("system_web_machine_policy_set:\n{system_web_machine_policy_set:?}");

    // Only the system machine can instantiate a machine
    assert_matches!(
        system_web_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(system.web.machine.id)),
                action: ActionName::Instantiate,
                resource: &ResourceId::EntityType(Cow::Borrowed(&machine_type.id)),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    );
    assert_matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(system.machine.id)),
                action: ActionName::Instantiate,
                resource: &ResourceId::EntityType(Cow::Borrowed(&machine_type.id)),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );

    assert_matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(system.machine.id)),
                action: ActionName::Instantiate,
                resource: &ResourceId::EntityType(Cow::Borrowed(&document_type.id)),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(system.machine.id)),
                action: ActionName::Instantiate,
                resource: &ResourceId::EntityType(Cow::Borrowed(&document_type.id)),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );

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

    let user = TestUser::generate(&mut policy_store, &mut context, "alice")?;

    let machine_type = EntityTypeResource {
        web_id: Some(system.web.id),
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@h/types/entity-type/machine/v/2",
        )?)),
    };
    context.add_entity_type(&machine_type);

    let document_type = EntityTypeResource {
        web_id: Some(system.web.id),
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@h/types/entity-type/document/v/1",
        )?)),
    };
    context.add_entity_type(&document_type);

    let web_type = EntityTypeResource {
        web_id: Some(user.web.id),
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@alice/types/entity-type/custom/v/1",
        )?)),
    };
    context.add_entity_type(&web_type);

    let web_entity = EntityResource {
        id: EntityId {
            web_id: user.web.id,
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: None,
        },
        entity_types: Cow::Owned(vec![web_type.id.as_url().clone()]),
        entity_base_types: Cow::Owned(vec![web_type.id.as_url().base_url.clone()]),
        created_by: user.id.into(),
    };
    context.add_entity(&web_entity);

    policy_store.extend_context(&mut context, ActorId::User(user.id))?;
    policy_store.extend_context(&mut context, ActorId::Machine(user.web.machine.id))?;
    let context = context.build()?;

    let user_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([
            ActionName::Instantiate,
            ActionName::View,
            ActionName::Update,
        ]))
        .with_policies(policy_store.get_policies(ActorId::User(user.id))?)?;
    println!("user_policy_set:\n{user_policy_set:?}");

    let user_machine_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::View, ActionName::Update]))
        .with_policies(policy_store.get_policies(ActorId::Machine(user.web.machine.id))?)?;
    let system_machine_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::View, ActionName::Update]))
        .with_policies(policy_store.get_policies(ActorId::Machine(system.machine.id))?)?;
    println!("user_machine_policy_set:\n{user_machine_policy_set:?}");

    eprintln!("context:\n{context:?}");

    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::Instantiate,
                resource: &ResourceId::EntityType(Cow::Borrowed(&machine_type.id)),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    );
    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::Instantiate,
                resource: &ResourceId::EntityType(Cow::Borrowed(&document_type.id)),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::Instantiate,
                resource: &ResourceId::EntityType(Cow::Borrowed(&web_type.id)),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );

    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        user_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(user.web.machine.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(system.machine.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    );

    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::Update,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        user_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(user.web.machine.id)),
                action: ActionName::Update,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(system.machine.id)),
                action: ActionName::Update,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    );

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

    let org_web = TestWeb::generate(&mut policy_store, &mut context, "example")?;

    let user = TestUser::generate(&mut policy_store, &mut context, "alice")?;
    policy_store.assign_role(
        ActorId::User(user.id),
        ActorGroupId::Web(org_web.id),
        RoleName::Administrator,
    )?;

    let web_type = EntityTypeResource {
        web_id: Some(org_web.id),
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@alice/types/entity-type/custom/v/1",
        )?)),
    };
    context.add_entity_type(&web_type);

    let web_entity = EntityResource {
        id: EntityId {
            web_id: org_web.id,
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: None,
        },
        entity_types: Cow::Owned(vec![web_type.id.as_url().clone()]),
        entity_base_types: Cow::Owned(vec![web_type.id.as_url().base_url.clone()]),
        created_by: user.id.into(),
    };
    context.add_entity(&web_entity);

    policy_store.extend_context(&mut context, ActorId::User(user.id))?;
    policy_store.extend_context(&mut context, ActorId::Machine(user.web.machine.id))?;
    policy_store.extend_context(&mut context, ActorId::Machine(org_web.machine.id))?;
    let context = context.build()?;

    let org_machine_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::View, ActionName::Update]))
        .with_policies(policy_store.get_policies(ActorId::Machine(org_web.machine.id))?)?;
    println!("org_machine_policy_set:\n{org_machine_policy_set:?}");

    let user_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::View, ActionName::Update]))
        .with_policies(policy_store.get_policies(ActorId::User(user.id))?)?;
    println!("user_policy_set:\n{user_policy_set:?}");

    let user_machine_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::Update]))
        .with_policies(policy_store.get_policies(ActorId::Machine(user.web.machine.id))?)?;
    println!("user_machine_policy_set:\n{user_machine_policy_set:?}");

    let system_machine_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::View, ActionName::Update]))
        .with_policies(policy_store.get_policies(ActorId::Machine(system.machine.id))?)?;
    println!("system_machine_policy_set:\n{system_machine_policy_set:?}");

    assert_matches!(
        org_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(org_web.machine.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(user.web.machine.id.into()),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );

    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        org_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(org_web.machine.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(user.web.machine.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    );
    assert_matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(system.web.machine.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    );

    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::Update,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        org_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(org_web.machine.id)),
                action: ActionName::Update,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        user_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(user.web.machine.id)),
                action: ActionName::Update,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    );
    assert_matches!(
        system_machine_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::Machine(system.web.machine.id)),
                action: ActionName::Update,
                resource: &ResourceId::Entity(web_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    );

    Ok(())
}

#[test]
fn instance_admin_without_access_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut policy_store = MemoryPolicyStore::default();

    let system = TestSystem::generate(&mut policy_store, &mut context)?;

    let user = TestUser::generate(&mut policy_store, &mut context, "alice")?;
    println!("user: {user:?}");

    policy_store.extend_context(&mut context, ActorId::User(user.id))?;
    let context = context.build()?;

    let user_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::View, ActionName::Update]))
        .with_policies(policy_store.get_policies(ActorId::User(user.id))?)?;
    println!("user_policy_set:\n{user_policy_set:?}");

    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(system.hash_instance_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::Update,
                resource: &ResourceId::Entity(system.hash_instance_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Never
    );

    Ok(())
}

#[test]
fn instance_admin_with_access_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();
    let mut policy_store = MemoryPolicyStore::default();

    let system = TestSystem::generate(&mut policy_store, &mut context)?;

    let user = TestUser::generate(&mut policy_store, &mut context, "alice")?;
    policy_store.assign_role(
        ActorId::User(user.id),
        system.hash_instance_admins,
        RoleName::Administrator,
    )?;

    policy_store.extend_context(&mut context, ActorId::User(user.id))?;
    let context = context.build()?;

    let user_policy_set = PolicySet::default()
        .with_tracked_actions(HashSet::from([ActionName::View, ActionName::Update]))
        .with_policies(policy_store.get_policies(ActorId::User(user.id))?)?;
    println!("user_policy_set:\n{user_policy_set:?}");

    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::View,
                resource: &ResourceId::Entity(system.hash_instance_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );
    assert_matches!(
        user_policy_set.evaluate(
            &Request {
                actor: Some(ActorId::User(user.id)),
                action: ActionName::Update,
                resource: &ResourceId::Entity(system.hash_instance_entity.id.entity_uuid),
                context: RequestContext::default(),
            },
            &context,
        )?,
        Authorized::Always
    );

    Ok(())
}
