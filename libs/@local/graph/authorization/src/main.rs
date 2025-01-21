use core::{cell::OnceCell, error::Error, iter::empty, str::FromStr};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use cedar_policy_core::{
    ast::{
        self, Annotations, Effect, Eid, Entity, EntityAttrEvaluationError, EntityUID,
        EntityUIDEntry, Expr, Extension, Id, Name, PolicyID, PolicySet, Request,
        RequestSchemaAllPass, ResourceConstraint, RestrictedExpr, SlotId, StaticPolicy,
    },
    authorizer::{Authorizer, PartialResponse, ResponseKind},
    entities::{AllEntitiesNoAttrsSchema, Entities, NoEntitiesSchema, TCComputation},
    est,
    extensions::Extensions,
    parser::parse_policyset,
};
use cedar_policy_validator::{CoreSchema, ValidationMode, Validator, ValidatorSchema};
use serde::Deserialize;
use serde_json::json;
use smol_str::SmolStr;
use uuid::Uuid;

const POLICY_SRC: &str = include_str!("../cedar/policy.cedar");

fn eid(namespace: &'static str, name: impl Into<SmolStr>) -> EntityUID {
    EntityUID::from_components(
        Name::new(
            Id::from_str(namespace).expect("namespace should be valid"),
            [Id::from_str("HASH").expect("namespace should be valid")],
        ),
        Eid::new(name),
    )
    .into()
}

pub struct User {
    pub name: SmolStr,
}

impl From<User> for EntityUID {
    fn from(user: User) -> Self {
        eid("User", user.name)
    }
}

fn user_euid(name: impl Into<SmolStr>) -> EntityUID {
    User { name: name.into() }.into()
}

pub struct Organization {
    pub name: SmolStr,
}

impl From<Organization> for EntityUID {
    fn from(org: Organization) -> Self {
        eid("Org", org.name)
    }
}

fn organization_euid(name: impl Into<SmolStr>) -> EntityUID {
    Organization { name: name.into() }.into()
}

pub struct OrganizationRole {
    pub name: SmolStr,
    pub role: SmolStr,
}

impl From<OrganizationRole> for EntityUID {
    fn from(role: OrganizationRole) -> Self {
        eid("OrgRole", &format!("{}::{}", role.name, role.role))
    }
}

fn organization_role_euid(name: impl Into<SmolStr>, role: impl Into<SmolStr>) -> EntityUID {
    OrganizationRole {
        name: name.into(),
        role: role.into(),
    }
    .into()
}

pub enum PrincipalConstraint {
    Eq(User),
    In(OrganizationRole),
}

pub enum Action {
    Create,
    View,
    Update,
    Instantiate,
    Archive,
    Delete,
}

impl From<Action> for EntityUID {
    fn from(action: Action) -> Self {
        eid(
            "Action",
            SmolStr::new_static(match action {
                Action::Create => "Create",
                Action::View => "View",
                Action::Update => "Update",
                Action::Instantiate => "Instantiate",
                Action::Archive => "Archive",
                Action::Delete => "Delete",
            }),
        )
    }
}

pub enum ActionConstraint {
    Eq(Action),
    In(Vec<Action>),
}

pub enum ResourceType {
    Entity,
}

impl From<ResourceType> for Name {
    fn from(principal: Resource) -> Self {
        let namespace = match principal {
            ResourceType::Entity => "Entity",
        };

        Name::new(
            Id::from_str(namespace).expect("namespace should be valid"),
            [Id::from_str("HASH").expect("namespace should be valid")],
        )
    }
}

pub enum Resource {
    Entity { id: SmolStr },
}

impl From<Resource> for EntityUID {
    fn from(principal: Resource) -> Self {
        match principal {
            Resource::Entity { id } => eid("Entity", id.to_string()),
        }
    }
}

pub enum ResourceConstraint {
    Eq(Entity),
    In(Organization),
    IsIn(ResourceType, Organization),
}

fn entity_euid(id: impl Into<SmolStr>) -> EntityUID {
    Resource::Entity { id: id.into() }.into()
}

pub struct Policy {
    pub principal: Option<PrincipalConstraint>,
    pub action: Option<ActionConstraint>,
    pub resource: Option<ResourceConstraint>,
    pub conditions: Vec<()>,
}

impl From<Policy> for ast::Policy {
    fn from(policy: Policy) -> Self {
        let principal_constraint = policy.principal.map_or_else(
            ast::PrincipalConstraint::any,
            |principal| match principal {
                PrincipalConstraint::Eq(user) => {
                    ast::PrincipalConstraint::new(ast::PrincipalOrResourceConstraint::Eq(
                        ast::EntityReference::EUID(Arc::new(user.into())),
                    ))
                }
                PrincipalConstraint::In(role) => {
                    ast::PrincipalConstraint::new(ast::PrincipalOrResourceConstraint::Eq(
                        ast::EntityReference::EUID(Arc::new(role.into())),
                    ))
                }
            },
        );
        let action_constraint = policy
            .action
            .map_or_else(ast::ActionConstraint::any, |action| match action {
                ActionConstraint::Eq(action) => ast::ActionConstraint::Eq(Arc::new(action.into())),
                ActionConstraint::In(actions) => ast::ActionConstraint::In(
                    actions
                        .into_iter()
                        .map(|action| Arc::new(action.into()))
                        .collect(),
                ),
            });
        let resource_constraint =
            policy
                .resource
                .map_or_else(ast::ResourceConstraint::any, |resource| match resource {
                    ResourceConstraint::Eq(resource) => {
                        ast::ResourceConstraint::new(ast::PrincipalOrResourceConstraint::Eq(
                            ast::EntityReference::EUID(Arc::new(resource.into())),
                        ))
                    }
                    ResourceConstraint::In(resource) => {
                        ast::ResourceConstraint::new(ast::PrincipalOrResourceConstraint::In(
                            ast::EntityReference::EUID(Arc::new(resource.into())),
                        ))
                    }
                    ResourceConstraint::IsIn(ty, resource) => {
                        ast::ResourceConstraint::new(ast::PrincipalOrResourceConstraint::IsIn(
                            ty.into(),
                            ast::EntityReference::EUID(Arc::new(resource.into())),
                        ))
                    }
                });

        ast::Policy::from(
            ast::StaticPolicy::new(
                PolicyID::from_string(Uuid::new_v4().to_string()),
                Annotations::new(),
                Effect::Permit,
                principal_constraint,
                action_constraint,
                resource_constraint,
                Expr::val(true),
            )
            .expect("should not contain any slot"),
        )
    }
}

pub enum Principal {
    User(User),
    OrganizationRole(OrganizationRole),
}

impl From<User> for Principal {
    fn from(user: User) -> Self {
        Principal::User(user)
    }
}

impl From<OrganizationRole> for Principal {
    fn from(role: OrganizationRole) -> Self {
        Principal::OrganizationRole(role)
    }
}

fn viewer(principal: impl Into<Principal>, resource: Resource) -> Policy {
    Policy {
        principal: match principal.into() {
            Principal::User(user) => Some(PrincipalConstraint::Eq(user)),
            Principal::OrganizationRole(role) => Some(PrincipalConstraint::In(role)),
        },
        action: Some(ActionConstraint::Eq(Action::View)),
        resource: Some(ResourceConstraint::Eq(())),
        conditions: vec![],
    }
}

fn editor(principal: impl Into<Principal>, resource: Resource) -> Policy {
    Policy {
        principal: match principal.into() {
            Principal::User(user) => Some(PrincipalConstraint::Eq(user)),
            Principal::OrganizationRole(role) => Some(PrincipalConstraint::In(role)),
        },
        action: Some(ActionConstraint::In(vec![Action::View, Action::Update])),
        resource: Some(resource),
        conditions: vec![],
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut policy_set = parse_policyset(POLICY_SRC)?;

    policy_set.add(
        viewer(User { name: "tim".into() }, Resource::Entity {
            id: "photo".into(),
        })
        .into(),
    );
    policy_set.add(
        editor(User { name: "tim".into() }, Resource::Entity {
            id: "person".into(),
        })
        .into(),
    );

    for policy in policy_set.policies() {
        println!("{policy}");
    }
    use rand::distributions::{Alphanumeric, DistString};

    // let template_id = PolicyID::from_string("policy0");
    // let template = policy_set
    //     .get_template(&PolicyID::from_string("policy0"))
    //     .clone()
    //     .unwrap();

    // println!("{template}, {:?}", template.slots().collect::<Vec<_>>());

    // for i in 0..0 {
    //     let string = Alphanumeric.sample_string(&mut rand::thread_rng(), 16);

    //     policy_set.link(
    //         template_id.clone(),
    //         PolicyID::from_string(format!("template-instance-{i}")),
    //         HashMap::from([(SlotId::principal(), Principal::user(&string).into())]),
    //     );
    // }

    let start = std::time::Instant::now();

    let validator_schema = ValidatorSchema::from_json_value(
        json!({
            "HASH": {
                "actions": {
                    "Update": {
                        "appliesTo": {
                            "principalTypes": ["User"],
                            "resourceTypes": ["Entity"],
                        }
                    },
                    "View": {
                        "appliesTo": {
                            "principalTypes": ["User"],
                            "resourceTypes": ["Entity"],
                        }
                    },
                },
                "entityTypes": {
                    "OrgRole": {
                        "memberOfTypes": [ "OrgRole" ],
                    },
                    "Org": {

                    },
                    "User": {
                        "memberOfTypes": [ "OrgRole" ],
                    },
                    "Entity": {
                        "memberOfTypes": [ "Org" ],
                    }
                }
            }
        }),
        Extensions::all_available(),
    )?;
    let schema = CoreSchema::new(&validator_schema);
    let validator = Validator::new(validator_schema.clone());
    let (errors, warnings) = validator
        .validate(&policy_set, ValidationMode::Strict)
        .into_errors_and_warnings();
    for error in errors {
        eprintln!("error: {error:?}");
    }
    for warning in warnings {
        eprintln!("warning: {warning:?}");
    }

    const ITERS: u32 = 10000;
    for i in 0..ITERS {
        let authorizer = Authorizer::new();

        let tim = user_euid("tim");
        let hash = organization_euid("HASH");
        let hash_admin = organization_role_euid("HASH", "admin");
        let hash_member = organization_role_euid("HASH", "member");
        let view = EntityUID::from(Action::View);
        let update = EntityUID::from(Action::Update);

        let request = Request::new_with_unknowns(
            EntityUIDEntry::Known {
                euid: Arc::new(tim.clone()),
                loc: None,
            },
            EntityUIDEntry::Known {
                euid: Arc::new(update.clone()),
                loc: None,
            },
            EntityUIDEntry::Unknown { loc: None },
            None,
            Some(&schema),
            Extensions::all_available(),
        )?;

        let entities = Entities::new().add_entities(
            [
                Entity::new(
                    tim.clone(),
                    HashMap::from([]),
                    HashSet::from([hash_admin.clone()]),
                    &Extensions::all_available(),
                )?,
                Entity::new(
                    hash_admin.clone(),
                    HashMap::new(),
                    HashSet::from([hash_member.clone()]),
                    &Extensions::all_available(),
                )?,
            ],
            Some(&schema),
            TCComputation::ComputeNow,
            Extensions::all_available(),
        )?;

        let response = authorizer.is_authorized_core(request.clone(), &policy_set, &entities);
        if i == 0 {
            println!("{request}");
            println!("{entities}");
            match response {
                ResponseKind::FullyEvaluated(response) => println!("{:?}", response.decision),
                ResponseKind::Partial(residual) => {
                    println!("Residuals:");
                    for policy in residual.residuals.policies() {
                        println!("{policy}");
                    }
                }
            }
        }
    }
    println!("Took ~{:?} to run a query", start.elapsed() / ITERS);

    Ok(())
}
