use core::error::Error;

use cedar_policy_core::parser::parse_policy_or_template;
use error_stack::ResultExt as _;
use hash_graph_authorization::policies::{Policy, PolicySet, PolicyValidator, ResolvedPolicy};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::entity::EntityId,
    principal::{
        actor::MachineId,
        actor_group::{TeamId, WebId},
        role::WebRoleId,
    },
};

#[track_caller]
fn check_policy(policy: &ResolvedPolicy) -> Result<(), Box<dyn Error>> {
    let mut policy_set = PolicySet::default();
    policy_set.add_policy(policy)?;

    PolicyValidator
        .validate_policy_set(&policy_set)
        .attach_lazy(|| format!("policy: {policy:?}"))?;

    Ok(())
}

fn read_policies(policy_strings: &str) -> Vec<Policy> {
    let policies = Policy::parse_cedar_policies(policy_strings).expect("should be a valid policy");

    for (cedar_policy_string, policy) in policy_strings
        .split_inclusive(';')
        .filter(|policy| !policy.trim().is_empty())
        .zip(&policies)
    {
        assert_eq!(
            parse_policy_or_template(None, cedar_policy_string)
                .expect("should be a valid policy")
                .to_string(),
            format!("{policy:?}"),
        );

        let parsed_policy = Policy::parse_cedar_policy(cedar_policy_string, None)
            .expect("should be a valid policy");

        check_policy(&ResolvedPolicy {
            original_policy_id: parsed_policy.id,
            effect: parsed_policy.effect,
            actions: parsed_policy.actions,
            resource: parsed_policy.resource,
        })
        .expect("should be a valid policy");
    }

    policies
}

pub(crate) fn forbid_update_web_machine() -> Vec<Policy> {
    read_policies(include_str!("forbid-update-web-machine.cedar"))
}

pub(crate) fn permit_admin_web(web_id: WebId, admin_role: WebRoleId) -> Vec<Policy> {
    #[expect(clippy::literal_string_with_formatting_args)]
    read_policies(
        &include_str!("permit-admin-web.cedar")
            .replace("{web_id}", &web_id.to_string())
            .replace("{role_id}", &admin_role.to_string()),
    )
}

pub(crate) fn permit_hash_instance_admins(
    team_id: TeamId,
    hash_instance_entity_id: EntityId,
) -> Vec<Policy> {
    #[expect(clippy::literal_string_with_formatting_args)]
    read_policies(
        &include_str!("permit-hash-instance-admins.cedar")
            .replace("{team_id}", &team_id.to_string())
            .replace(
                "{entity_id}",
                &hash_instance_entity_id.entity_uuid.to_string(),
            ),
    )
}

pub(crate) fn permit_instantiate(system_machine_id: MachineId) -> Vec<Policy> {
    #[expect(clippy::literal_string_with_formatting_args)]
    read_policies(
        &include_str!("permit-instantiate.cedar")
            .replace("{system_machine_id}", &system_machine_id.to_string()),
    )
}

pub(crate) fn permit_member_crud_web(web_id: WebId, member_role: WebRoleId) -> Vec<Policy> {
    #[expect(clippy::literal_string_with_formatting_args)]
    read_policies(
        &include_str!("permit-member-crud-web.cedar")
            .replace("{web_id}", &web_id.to_string())
            .replace("{role_id}", &member_role.to_string()),
    )
}

pub(crate) fn permit_view_ontology() -> Vec<Policy> {
    read_policies(include_str!("permit-view-ontology.cedar"))
}

pub(crate) fn permit_view_system_entities(system_web_id: WebId) -> Vec<Policy> {
    #[expect(clippy::literal_string_with_formatting_args)]
    read_policies(
        &include_str!("permit-view-system-entities.cedar")
            .replace("{system_web_id}", &system_web_id.to_string()),
    )
}
