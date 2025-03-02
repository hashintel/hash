use core::{error::Error, str::FromStr as _};

use cedar_policy_core::parser::parse_policy_or_template;
use error_stack::ResultExt as _;
use hash_graph_authorization::policies::{
    Effect, Policy, PolicyId, PolicySet, PolicyValidator,
    action::{ActionConstraint, ActionId},
    principal::{
        PrincipalConstraint,
        machine::{MachineId, MachinePrincipalConstraint},
        team::TeamRoleId,
        user::UserPrincipalConstraint,
        web::WebRoleId,
    },
    resource::{
        EntityResourceConstraint, EntityResourceFilter, EntityTypeResourceConstraint,
        EntityTypeResourceFilter, ResourceConstraint,
    },
};
use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
use pretty_assertions::assert_eq;
use type_system::url::{BaseUrl, VersionedUrl};
use uuid::Uuid;

#[track_caller]
fn check_policy(policy: &Policy) -> Result<(), Box<dyn Error>> {
    let mut policy_set = PolicySet::default();
    if policy.principal.has_slot() || policy.resource.has_slot() {
        policy_set.add_template(policy)?;
    } else {
        policy_set.add_policy(policy)?;
    }

    PolicyValidator
        .validate_policy_set(&policy_set)
        .attach_printable_lazy(|| format!("policy: {policy:?}"))?;

    Ok(())
}

pub(crate) fn forbid_update_web_machine() -> Vec<Policy> {
    const POLICIES: &str = include_str!("forbid-update-web-machine.cedar");

    let policies = vec![Policy {
        id: PolicyId::new(Uuid::new_v4()),
        effect: Effect::Forbid,
        principal: PrincipalConstraint::User(UserPrincipalConstraint::Any {}),
        action: ActionConstraint::One {
            action: ActionId::Update,
        },
        resource: ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: Some(EntityResourceFilter::IsType {
                entity_type: VersionedUrl::from_str(
                    "https://hash.ai/@h/types/entity-type/machine/v/2",
                )
                .expect("should be a valid URL"),
            }),
        }),
        constraints: None,
    }];

    for (index, cedar_policy_string) in POLICIES
        .split_inclusive(';')
        .filter(|policy| !policy.trim().is_empty())
        .enumerate()
    {
        assert_eq!(
            parse_policy_or_template(None, cedar_policy_string)
                .expect("should be a valid policy")
                .to_string(),
            format!("{:?}", policies[index]),
        );
    }

    policies
}

pub(crate) fn permit_admin_web(web_id: OwnedById, admin_role: WebRoleId) -> Vec<Policy> {
    const POLICIES: &str = include_str!("permit-admin-web.cedar");

    #[expect(clippy::literal_string_with_formatting_args)]
    let policies = Policy::parse_cedar_policies(
        &POLICIES
            .replace("{web_id}", &web_id.to_string())
            .replace("{role_id}", &admin_role.to_string()),
    )
    .expect("should be a valid policy");
    for policy in &policies {
        check_policy(policy).expect("should be a valid policy");
    }

    policies
}

pub(crate) fn permit_hash_instance_admins(
    admin_role: TeamRoleId,
    member_role: TeamRoleId,
    hash_instance_entity_id: EntityUuid,
) -> Vec<Policy> {
    const POLICIES: &str = include_str!("permit-hash-instance-admins.cedar");

    let policies = Policy::parse_cedar_policies(
        &POLICIES
            .replace("{admin_role_id}", &admin_role.to_string())
            .replace("{member_role_id}", &member_role.to_string())
            .replace("{entity_id}", &hash_instance_entity_id.to_string()),
    )
    .expect("should be a valid policy");
    for policy in &policies {
        check_policy(policy).expect("should be a valid policy");
    }

    policies
}

pub(crate) fn permit_instantiate(system_machine_id: MachineId) -> Vec<Policy> {
    const POLICIES: &str = include_str!("permit-instantiate.cedar");

    let policies = vec![
        Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: PrincipalConstraint::Public {},
            action: ActionConstraint::One {
                action: ActionId::Instantiate,
            },
            resource: ResourceConstraint::EntityType(EntityTypeResourceConstraint::Any {
                filter: Some(EntityTypeResourceFilter::Not {
                    filter: Box::new(EntityTypeResourceFilter::Any {
                        filters: vec![
                            EntityTypeResourceFilter::IsBaseUrl {
                                base_url: BaseUrl::new(
                                    "https://hash.ai/@h/types/entity-type/machine/".to_owned(),
                                )
                                .expect("should be a valid URL"),
                            },
                            EntityTypeResourceFilter::IsBaseUrl {
                                base_url: BaseUrl::new(
                                    "https://hash.ai/@h/types/entity-type/user/".to_owned(),
                                )
                                .expect("should be a valid URL"),
                            },
                            EntityTypeResourceFilter::IsBaseUrl {
                                base_url: BaseUrl::new(
                                    "https://hash.ai/@h/types/entity-type/organization/".to_owned(),
                                )
                                .expect("should be a valid URL"),
                            },
                            EntityTypeResourceFilter::IsBaseUrl {
                                base_url: BaseUrl::new(
                                    "https://hash.ai/@h/types/entity-type/hash-instance/"
                                        .to_owned(),
                                )
                                .expect("should be a valid URL"),
                            },
                        ],
                    }),
                }),
            }),
            constraints: None,
        },
        Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: PrincipalConstraint::Machine(MachinePrincipalConstraint::Exact {
                machine_id: Some(system_machine_id),
            }),
            action: ActionConstraint::One {
                action: ActionId::Instantiate,
            },
            resource: ResourceConstraint::EntityType(EntityTypeResourceConstraint::Any {
                filter: None,
            }),
            constraints: None,
        },
    ];

    #[expect(clippy::literal_string_with_formatting_args)]
    for (index, cedar_policy_string) in POLICIES
        .replace("{system_machine_id}", &system_machine_id.to_string())
        .split_inclusive(';')
        .filter(|policy| !policy.trim().is_empty())
        .enumerate()
    {
        assert_eq!(
            parse_policy_or_template(None, cedar_policy_string)
                .expect("should be a valid policy")
                .to_string(),
            format!("{:?}", policies[index]),
        );
    }

    policies
}

pub(crate) fn permit_member_crud_web(web_id: OwnedById, member_role: WebRoleId) -> Vec<Policy> {
    const POLICIES: &str = include_str!("permit-member-crud-web.cedar");

    #[expect(clippy::literal_string_with_formatting_args)]
    let policies = Policy::parse_cedar_policies(
        &POLICIES
            .replace("{web_id}", &web_id.to_string())
            .replace("{role_id}", &member_role.to_string()),
    )
    .expect("should be a valid policy");
    for policy in &policies {
        check_policy(policy).expect("should be a valid policy");
    }

    policies
}

pub(crate) fn permit_view_ontology() -> Vec<Policy> {
    const POLICIES: &str = include_str!("permit-view-ontology.cedar");

    let policies = Policy::parse_cedar_policies(POLICIES).expect("should be a valid policy");
    for policy in &policies {
        check_policy(policy).expect("should be a valid policy");
    }

    policies
}

pub(crate) fn permit_view_system_entities(system_web_id: OwnedById) -> Vec<Policy> {
    const POLICIES: &str = include_str!("permit-view-system-entities.cedar");

    let policies = vec![
        Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: PrincipalConstraint::Public {},
            action: ActionConstraint::One {
                action: ActionId::View,
            },
            resource: ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id: Some(system_web_id),
                filter: None,
            }),
            constraints: None,
        },
        Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: PrincipalConstraint::Public {},
            action: ActionConstraint::One {
                action: ActionId::View,
            },
            resource: ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: Some(EntityResourceFilter::IsAnyType {
                    entity_types: vec![
                        VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")
                            .expect("should be a valid URL"),
                        VersionedUrl::from_str(
                            "https://hash.ai/@h/types/entity-type/organization/v/2",
                        )
                        .expect("should be a valid URL"),
                    ],
                }),
            }),
            constraints: None,
        },
    ];

    #[expect(clippy::literal_string_with_formatting_args)]
    for (index, cedar_policy_string) in POLICIES
        .replace("{system_web_id}", &system_web_id.to_string())
        .split_inclusive(';')
        .filter(|policy| !policy.trim().is_empty())
        .enumerate()
    {
        assert_eq!(
            parse_policy_or_template(None, cedar_policy_string)
                .expect("should be a valid policy")
                .to_string(),
            format!("{:?}", policies[index]),
        );
    }

    policies
}
