#![expect(
    clippy::panic_in_result_fn,
    reason = "Tests use assertions that may panic"
)]

extern crate alloc;

mod definitions;

use alloc::borrow::Cow;
use core::{error::Error, str::FromStr as _};

use hash_graph_authorization::policies::{
    ContextBuilder, Policy, PolicySet, Request, RequestContext,
    action::ActionId,
    principal::{
        ActorId,
        machine::{Machine, MachineId},
        role::RoleId,
        team::{TeamId, TeamRoleId},
        user::{User, UserId},
        web::WebRoleId,
    },
    resource::{EntityResource, EntityTypeId, EntityTypeResource, ResourceId},
};
use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
use type_system::url::VersionedUrl;
use uuid::Uuid;

use self::definitions::{
    forbid_update_web_machine, permit_admin_web, permit_hash_instance_admins, permit_instantiate,
    permit_member_crud_web, permit_view_ontology, permit_view_system_entities,
};

fn generate_machine(web_id: OwnedById, roles: Vec<RoleId>) -> Result<Machine, Box<dyn Error>> {
    let machine_id = MachineId::new(Uuid::new_v4());
    let entity = EntityResource {
        web_id,
        id: EntityUuid::new(machine_id.into_uuid()),
        entity_type: Cow::Owned(vec![
            VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/machine/v/2")?,
            VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")?,
        ]),
    };

    Ok(Machine {
        id: machine_id,
        roles,
        entity,
    })
}

#[derive(Debug, serde::Serialize)]
struct Web {
    id: OwnedById,
    admin_role: WebRoleId,
    member_role: WebRoleId,
    machine: Machine,
}

impl Web {
    fn generate() -> Result<(Self, Vec<Policy>), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        let admin_role = WebRoleId::new(Uuid::new_v4());
        let member_role = WebRoleId::new(Uuid::new_v4());
        let machine = generate_machine(web_id, vec![RoleId::Web(member_role)])?;

        let mut policies = permit_admin_web(web_id, admin_role)?;
        policies.extend(permit_member_crud_web(web_id, member_role)?);

        Ok((
            Self {
                id: web_id,
                admin_role,
                member_role,
                machine,
            },
            policies,
        ))
    }
}

#[derive(Debug, serde::Serialize)]
struct Team {
    id: TeamId,
    admin_role: TeamRoleId,
    member_role: TeamRoleId,
}

impl Team {
    fn generate() -> Self {
        Self {
            id: TeamId::new(Uuid::new_v4()),
            admin_role: TeamRoleId::new(Uuid::new_v4()),
            member_role: TeamRoleId::new(Uuid::new_v4()),
        }
    }
}

fn generate_user(web: &Web) -> Result<User, Box<dyn Error>> {
    let user_id = UserId::new(web.id.into_uuid());
    let entity = EntityResource {
        web_id: web.id,
        id: EntityUuid::new(user_id.into_uuid()),
        entity_type: Cow::Owned(vec![
            VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/user/v/6")?,
            VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")?,
        ]),
    };

    Ok(User {
        id: user_id,
        roles: vec![RoleId::Web(web.admin_role)],
        entity,
    })
}

#[derive(Debug, serde::Serialize)]
struct System {
    web: Web,
    machine: Machine,
    hash_ai_machine: Machine,
    hash_instance_admins: Team,
    hash_instance_entity: EntityResource<'static>,
}

impl System {
    fn generate() -> Result<(Self, Vec<Policy>), Box<dyn Error>> {
        let (web, mut policies) = Web::generate()?;
        let system_machine = generate_machine(web.id, vec![RoleId::Web(web.admin_role)])?;
        let hash_ai_machine = generate_machine(web.id, Vec::new())?;

        let hash_instance_admins = Team::generate();
        let hash_instance_entity = EntityResource {
            web_id: web.id,
            id: EntityUuid::new(Uuid::new_v4()),
            entity_type: Cow::Owned(vec![VersionedUrl::from_str(
                "https://hash.ai/@h/types/entity-type/hash-instance/v/1",
            )?]),
        };

        policies.extend(forbid_update_web_machine()?);
        policies.extend(permit_view_system_entities(web.id)?);
        policies.extend(permit_view_ontology()?);
        policies.extend(permit_instantiate(system_machine.id)?);
        policies.extend(permit_hash_instance_admins(
            hash_instance_admins.admin_role,
            hash_instance_admins.member_role,
            hash_instance_entity.id,
        )?);

        Ok((
            Self {
                web,
                machine: system_machine,
                hash_ai_machine,
                hash_instance_admins,
                hash_instance_entity,
            },
            policies,
        ))
    }

    fn extend_context(&self, context: &mut ContextBuilder) {
        context.add_machine(&self.web.machine);
        context.add_machine(&self.machine);
        context.add_machine(&self.hash_ai_machine);
        context.add_entity(&self.hash_instance_entity);
    }
}

#[test]
fn instantiate() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();

    let (system, system_policies) = System::generate()?;
    system.extend_context(&mut context);

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
            actor: ActorId::Machine(system.web.machine.id),
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

    let (system, system_policies) = System::generate()?;
    system.extend_context(&mut context);

    let (user_web, user_web_policies) = Web::generate()?;
    context.add_machine(&user_web.machine);
    let user = generate_user(&user_web)?;
    context.add_user(&user);

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
        web_id: user_web.id,
        id: Cow::Owned(EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@alice/types/entity-type/custom/v/1",
        )?)),
    };
    context.add_entity_type(&web_type);

    let web_entity = EntityResource {
        web_id: user_web.id,
        id: EntityUuid::new(Uuid::new_v4()),
        entity_type: Cow::Owned(vec![web_type.id.as_url().clone()]),
    };
    context.add_entity(&web_entity);

    let context = context.build()?;
    let policy_set = PolicySet::default()
        .with_policies(&system_policies)?
        .with_policies(&user_web_policies)?;

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
            actor: ActorId::Machine(user_web.machine.id),
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
            actor: ActorId::Machine(user_web.machine.id),
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
#[expect(
    clippy::too_many_lines,
    reason = "Mostly asserting the correct policies are applied"
)]
fn org_web_permissions() -> Result<(), Box<dyn Error>> {
    let mut context = ContextBuilder::default();

    let (system, system_policies) = System::generate()?;
    system.extend_context(&mut context);

    let (org_web, org_web_policies) = Web::generate()?;
    context.add_machine(&org_web.machine);

    let (user_web, user_web_policies) = Web::generate()?;
    context.add_machine(&user_web.machine);
    let mut user = generate_user(&user_web)?;
    user.roles.push(RoleId::Web(org_web.member_role));
    context.add_user(&user);

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

    let context = context.build()?;
    let policy_set = PolicySet::default()
        .with_policies(&system_policies)?
        .with_policies(&org_web_policies)?
        .with_policies(&user_web_policies)?;
    println!("context:\n{context:?}\npolicies:\n{policy_set:?}");
    println!("{:?}", org_web.machine.id);

    assert!(policy_set.evaluate(
        &Request {
            actor: ActorId::Machine(org_web.machine.id),
            action: ActionId::View,
            resource: &ResourceId::Entity(user_web.machine.entity.id),
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
            actor: ActorId::Machine(user_web.machine.id),
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
            actor: ActorId::Machine(user_web.machine.id),
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

    let (system, system_policies) = System::generate()?;
    system.extend_context(&mut context);

    let (user_web, user_web_policies) = Web::generate()?;
    context.add_machine(&user_web.machine);
    let user = generate_user(&user_web)?;
    context.add_user(&user);

    let context = context.build()?;
    let policy_set = PolicySet::default()
        .with_policies(&system_policies)?
        .with_policies(&user_web_policies)?;

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

    let (system, system_policies) = System::generate()?;
    system.extend_context(&mut context);

    let (user_web, user_web_policies) = Web::generate()?;
    context.add_machine(&user_web.machine);
    let mut user = generate_user(&user_web)?;
    user.roles
        .push(RoleId::Team(system.hash_instance_admins.admin_role));
    context.add_user(&user);

    let context = context.build()?;
    let policy_set = PolicySet::default()
        .with_policies(&system_policies)?
        .with_policies(&user_web_policies)?;

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
