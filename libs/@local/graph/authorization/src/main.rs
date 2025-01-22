#![expect(
    clippy::use_debug,
    clippy::print_stdout,
    clippy::print_stderr,
    clippy::std_instead_of_alloc
)]

use core::iter::empty;
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::BufReader,
    sync::{Arc, LazyLock, OnceLock},
};

use cedar_policy_core::{
    ast::{
        self, Annotations, Effect, Eid, Entity, EntityType, EntityUID, EntityUIDEntry, Expr, Name,
        PolicyID, Request, RestrictedExpr,
    },
    authorizer::Authorizer,
    entities::{Entities, TCComputation},
    extensions::Extensions,
    parser::parse_policyset,
};
use cedar_policy_validator::{
    CoreSchema, ValidationMode, Validator, ValidatorSchema, cedar_schema::parser::parse_schema,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use smol_str::SmolStr;
use uuid::Uuid;

fn entity_type(name: &'static str) -> EntityType {
    static HASH_NAMESPACE: LazyLock<Name> =
        LazyLock::new(|| Name::parse_unqualified_name("HASH").expect("name should be valid"));

    EntityType::from(
        Name::parse_unqualified_name(name)
            .expect("name should be valid")
            .qualify_with_name(Some(&HASH_NAMESPACE)),
    )
}

fn eid(ty: &'static str, name: impl Into<SmolStr>) -> EntityUID {
    EntityUID::from_components(entity_type(ty), Eid::new(name), None)
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

impl From<ResourceType> for EntityType {
    fn from(principal: ResourceType) -> Self {
        entity_type(match principal {
            ResourceType::Entity => "Entity",
        })
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
    Eq(Resource),
    In(Organization),
    IsIn(ResourceType, Organization),
}

pub struct Policy {
    pub principal: Option<PrincipalConstraint>,
    pub action: Option<ActionConstraint>,
    pub resource: Option<ResourceConstraint>,
    pub conditions: Vec<()>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Web {
    pub id: String,
}

impl Web {
    fn to_entity_uid(&self) -> EntityUID {
        static ENTITY_TYPE: LazyLock<EntityType> = LazyLock::new(|| entity_type("Web"));
        EntityUID::from_components((*ENTITY_TYPE).clone(), Eid::new(&self.id), None)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct User {
    pub web: Web,
}

impl User {
    fn to_entity_uid(&self) -> EntityUID {
        static ENTITY_TYPE: LazyLock<EntityType> = LazyLock::new(|| entity_type("User"));
        EntityUID::from_components((*ENTITY_TYPE).clone(), Eid::new(&self.web.id), None)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Organization {
    pub web: Web,
}

impl Organization {
    fn to_entity_uid(&self) -> EntityUID {
        static ENTITY_TYPE: LazyLock<EntityType> = LazyLock::new(|| entity_type("Organization"));
        EntityUID::from_components((*ENTITY_TYPE).clone(), Eid::new(&self.web.id), None)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrganizationRole {
    pub organization: Organization,
    pub name: String,
}

impl OrganizationRole {
    fn to_entity_uid(&self) -> EntityUID {
        static ENTITY_TYPE: LazyLock<EntityType> =
            LazyLock::new(|| entity_type("OrganizationRole"));
        EntityUID::from_components(
            (*ENTITY_TYPE).clone(),
            Eid::new(format!("{}::{}", self.organization.web.id, self.name)),
            None,
        )
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Team {
    pub organization: Organization,
    pub name: String,
}

impl Team {
    fn to_entity_uid(&self) -> EntityUID {
        static ENTITY_TYPE: LazyLock<EntityType> = LazyLock::new(|| entity_type("Team"));
        EntityUID::from_components(
            (*ENTITY_TYPE).clone(),
            Eid::new(format!("{}::{}", self.organization.web.id, self.name)),
            None,
        )
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TeamRole {
    pub team: Team,
    pub name: String,
}

impl TeamRole {
    fn to_entity_uid(&self) -> EntityUID {
        static ENTITY_TYPE: LazyLock<EntityType> = LazyLock::new(|| entity_type("TeamRole"));
        EntityUID::from_components(
            (*ENTITY_TYPE).clone(),
            Eid::new(format!(
                "{}::{}::{}",
                self.team.organization.web.id, self.team.name, self.name
            )),
            None,
        )
    }
}

pub enum Principal {
    User(User),
    OrganizationRole(OrganizationRole),
}

impl From<User> for Principal {
    fn from(user: User) -> Self {
        Self::User(user)
    }
}

impl From<OrganizationRole> for Principal {
    fn from(role: OrganizationRole) -> Self {
        Self::OrganizationRole(role)
    }
}

#[expect(clippy::too_many_lines)]
fn main() -> miette::Result<()> {
    let policy_set = parse_policyset(
        &fs::read_to_string("cedar/policy.cedar").expect("Policy file should exist"),
    )?;
    let validator_schema = ValidatorSchema::from_json_file(
        BufReader::new(File::open("cedar/schema.json").expect("Schema file should exist")),
        Extensions::all_available(),
    )?;

    for policy in policy_set.policies() {
        println!("{policy}");
    }

    let start = std::time::Instant::now();

    let schema = CoreSchema::new(&validator_schema);
    let validator = Validator::new(validator_schema.clone());
    let (errors, warnings) = validator
        .validate(&policy_set, ValidationMode::Strict)
        .into_errors_and_warnings();
    for error in errors {
        eprintln!("ERROR: {}", error);
    }
    for warning in warnings {
        eprintln!("WARN: {}", warning);
    }

    #[expect(clippy::items_after_statements)]
    const ITERS: u32 = 10_000;
    for i in 0..ITERS {
        let authorizer = Authorizer::new();

        let tim = User {
            web: Web {
                id: "tim".to_owned(),
            },
        };
        let tim_euid = tim.to_entity_uid();
        let hash = Organization {
            web: Web {
                id: "HASH".to_owned(),
            },
        };

        let hash_member = OrganizationRole {
            organization: hash.clone(),
            name: "member".to_owned(),
        };

        let hash_finance = Team {
            organization: hash.clone(),
            name: "finance".to_owned(),
        };

        let hash_finance_member = TeamRole {
            team: hash_finance.clone(),
            name: "member".to_owned(),
        };

        let view = EntityUID::from(Action::View);

        let request = Request::new_with_unknowns(
            EntityUIDEntry::Known {
                euid: Arc::new(tim_euid.clone()),
                loc: None,
            },
            EntityUIDEntry::Known {
                euid: Arc::new(view.clone()),
                loc: None,
            },
            EntityUIDEntry::Unknown {
                ty: Some(ResourceType::Entity.into()),
                loc: None,
            },
            None,
            Some(&schema),
            Extensions::all_available(),
        )?;

        let entities = Entities::new().add_entities(
            [
                Arc::new(Entity::new(
                    tim_euid,
                    HashMap::from([("web".into(), RestrictedExpr::val(hash.web.to_entity_uid()))]),
                    HashSet::from([
                        hash_member.to_entity_uid(),
                        hash_finance_member.to_entity_uid(),
                    ]),
                    empty(),
                    Extensions::all_available(),
                )?),
                Arc::new(Entity::new(
                    hash_member.to_entity_uid(),
                    HashMap::from([(
                        "organization".into(),
                        RestrictedExpr::val(hash.to_entity_uid()),
                    )]),
                    HashSet::from([]),
                    empty(),
                    Extensions::all_available(),
                )?),
                Arc::new(Entity::new(
                    hash_finance.to_entity_uid(),
                    HashMap::from([(
                        "organization".into(),
                        RestrictedExpr::val(hash.to_entity_uid()),
                    )]),
                    HashSet::from([]),
                    empty(),
                    Extensions::all_available(),
                )?),
                Arc::new(Entity::new(
                    hash_finance_member.to_entity_uid(),
                    HashMap::from([(
                        "team".into(),
                        RestrictedExpr::val(hash_finance.to_entity_uid()),
                    )]),
                    HashSet::from([]),
                    empty(),
                    Extensions::all_available(),
                )?),
            ],
            Some(&schema),
            TCComputation::ComputeNow,
            Extensions::all_available(),
        )?;

        let response = authorizer.is_authorized_core(request.clone(), &policy_set, &entities);
        if i == 0 {
            println!("{request}");
            println!("{entities}");
            println!("Residuals:");
            for policy in response.all_residuals() {
                println!("{policy}");
            }
        }
    }
    println!("Took ~{:?} to run a query", start.elapsed() / ITERS);

    Ok(())
}
