use core::iter;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{
    AuthorizationApi,
    policies::{
        Effect,
        action::ActionName,
        principal::PrincipalConstraint,
        resource::{
            EntityResourceConstraint, EntityResourceFilter, EntityTypeResourceConstraint,
            EntityTypeResourceFilter, ResourceConstraint,
        },
        store::{
            PolicyCreationParams, PolicyFilter, PolicyStore as _, PolicyUpdateOperation,
            error::EnsureSystemPoliciesError,
        },
    },
};
use tokio_postgres::Transaction;
use type_system::{
    ontology::{BaseUrl, VersionedUrl, id::OntologyTypeVersion},
    principal::{
        actor::{ActorId, ActorType, MachineId},
        role::{RoleId, RoleName, TeamRole, WebRole},
    },
};

use super::PostgresStore;

macro_rules! base_url {
    ($url:expr) => {
        BaseUrl::new($url.to_owned()).expect("should be a valid base URL")
    };
}

/// Creates a list of filters for entities with their type versions from 1 to `max_version`.
// TODO: Allow entity filter for only the BaseURL
//   see https://linear.app/hash/issue/H-4599/support-baseurl-and-version-filter-of-types-in-entity-resource
fn create_version_filters(
    base_url: BaseUrl,
    max_version: u32,
) -> impl Iterator<Item = EntityResourceFilter> {
    let mut base_url = Some(base_url);

    (1..=max_version).map(move |version| EntityResourceFilter::IsOfType {
        entity_type: VersionedUrl {
            base_url: if version < max_version {
                base_url.clone()
            } else {
                base_url.take()
            }
            .unwrap_or_else(|| unreachable!()),
            version: OntologyTypeVersion::new(version),
        },
    })
}

pub(crate) fn system_actor_create_web_policy(
    system_machine_actor: MachineId,
) -> PolicyCreationParams {
    PolicyCreationParams {
        name: Some("system-machine-create-web".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: ActorId::Machine(system_machine_actor),
        }),
        actions: vec![ActionName::CreateWeb],
        resource: None,
    }
}

fn system_actor_view_entity_policies(
    system_machine_actor: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("system-machine-view-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: ActorId::Machine(system_machine_actor),
        }),
        actions: vec![ActionName::ViewEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: EntityResourceFilter::Any {
                filters: create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/sync-linear-data-with/"),
                    1,
                )
                .chain(create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/prospective-user/"),
                    1,
                ))
                .collect(),
            },
        })),
    })
}

pub(crate) fn system_actor_policies(
    system_machine_actor: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(system_actor_create_web_policy(system_machine_actor))
        .chain(system_actor_view_entity_policies(system_machine_actor))
}

fn google_bot_view_entity_policies(
    google_bot_machine: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("google-bot-view-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: ActorId::Machine(google_bot_machine),
        }),
        actions: vec![ActionName::ViewEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: EntityResourceFilter::Any {
                filters: create_version_filters(
                    base_url!("https://hash.ai/@google/types/entity-type/account/"),
                    1,
                )
                .collect(),
            },
        })),
    })
}

pub(crate) fn google_bot_policies(
    google_bot_machine: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    google_bot_view_entity_policies(google_bot_machine)
}

pub(crate) fn linear_bot_policies(
    _linear_bot_machine: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::empty()
}

fn global_instantiate_policies() -> impl Iterator<Item = PolicyCreationParams> {
    [ActorType::User, ActorType::Machine, ActorType::Ai]
        .into_iter()
        .map(|actor_type| {
            let mut filters = vec![EntityTypeResourceFilter::IsBaseUrl {
                base_url: base_url!("https://hash.ai/@h/types/entity-type/hash-instance/"),
            }];
            if actor_type != ActorType::Machine {
                filters.extend([
                    EntityTypeResourceFilter::IsBaseUrl {
                        base_url: base_url!("https://hash.ai/@h/types/entity-type/actor/"),
                    },
                    EntityTypeResourceFilter::IsBaseUrl {
                        base_url: base_url!("https://hash.ai/@h/types/entity-type/organization/"),
                    },
                ]);
            }
            PolicyCreationParams {
                name: Some("authenticated-instantiate".to_owned()),
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::ActorType { actor_type }),
                actions: vec![ActionName::Instantiate],
                resource: Some(ResourceConstraint::EntityType(
                    EntityTypeResourceConstraint::Any {
                        filter: EntityTypeResourceFilter::Not {
                            filter: Box::new(EntityTypeResourceFilter::Any { filters }),
                        },
                    },
                )),
            }
        })
}

fn global_view_entity_policies() -> impl Iterator<Item = PolicyCreationParams> {
    let public_policies = iter::once(PolicyCreationParams {
        name: Some("public-view-entity".to_owned()),
        effect: Effect::Permit,
        principal: None,
        actions: vec![ActionName::ViewEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: EntityResourceFilter::Any {
                filters: create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/hash-instance/"),
                    1,
                )
                .chain(create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/user/"),
                    7,
                ))
                .chain(create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/organization/"),
                    3,
                ))
                .collect(),
            },
        })),
    });

    let authenticated_actor_policies = [ActorType::User, ActorType::Machine, ActorType::Ai]
        .into_iter()
        .map(|actor_type| PolicyCreationParams {
            name: Some("authenticated-view-entity".to_owned()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::ActorType { actor_type }),
            actions: vec![ActionName::ViewEntity],
            resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::Any {
                    filters: create_version_filters(
                        base_url!("https://hash.ai/@h/types/entity-type/machine/"),
                        2,
                    )
                    .chain(create_version_filters(
                        base_url!("https://hash.ai/@h/types/entity-type/service-feature/"),
                        1,
                    ))
                    .chain(create_version_filters(
                        base_url!("https://hash.ai/@h/types/entity-type/is-member-of/"),
                        1,
                    ))
                    .collect(),
                },
            })),
        });

    public_policies.chain(authenticated_actor_policies)
}

pub(crate) fn global_policies() -> impl Iterator<Item = PolicyCreationParams> {
    global_instantiate_policies().chain(global_view_entity_policies())
}

fn web_view_entity_policies(role: &WebRole) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("default-web-view-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Role {
            role: RoleId::Web(role.id),
            actor_type: None,
        }),
        actions: vec![ActionName::ViewEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Web {
            web_id: role.web_id,
            filter: match role.name {
                RoleName::Administrator => EntityResourceFilter::All { filters: vec![] },
                RoleName::Member => EntityResourceFilter::Any {
                    filters: vec![
                        EntityResourceFilter::CreatedByPrincipal,
                        EntityResourceFilter::Not {
                            filter: Box::new(EntityResourceFilter::Any {
                                filters: create_version_filters(
                                    base_url!("https://hash.ai/@h/types/entity-type/user-secret/"),
                                    1,
                                )
                                .chain(create_version_filters(
                                    base_url!("https://hash.ai/@h/types/entity-type/usage-record/"),
                                    2,
                                ))
                                .chain(create_version_filters(
                                    base_url!("https://hash.ai/@h/types/entity-type/incurred-in/"),
                                    2,
                                ))
                                .chain(create_version_filters(
                                    base_url!(
                                        "https://hash.ai/@h/types/entity-type/records-usage-of/"
                                    ),
                                    1,
                                ))
                                .collect(),
                            }),
                        },
                    ],
                },
            },
        })),
    })
}

// TODO: Returning an iterator causes a borrow checker error
pub(crate) fn web_policies(role: &WebRole) -> Vec<PolicyCreationParams> {
    web_view_entity_policies(role).collect()
}

fn instance_admins_view_entity_policy(
    role: &TeamRole,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("hash-admins-view-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Role {
            role: RoleId::Team(role.id),
            actor_type: None,
        }),
        actions: vec![ActionName::ViewEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: EntityResourceFilter::Any {
                filters: create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/incurred-in/"),
                    1,
                )
                .chain(create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/usage-record/"),
                    2,
                ))
                .chain(create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/records-usage-of/"),
                    1,
                ))
                .chain(create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/prospective-user/"),
                    1,
                ))
                .collect(),
            },
        })),
    })
}

// TODO: Returning an iterator causes a borrow checker error, even if using `+ use<'_>`
pub(crate) fn instance_admins_policies(role: &TeamRole) -> Vec<PolicyCreationParams> {
    instance_admins_view_entity_policy(role).collect()
}

impl<A> PostgresStore<Transaction<'_>, A>
where
    A: AuthorizationApi + Send + Sync,
{
    #[expect(clippy::too_many_lines)]
    pub(crate) async fn update_seeded_policies(
        &mut self,
        authenticated_actor: ActorId,
        policies: impl IntoIterator<Item = PolicyCreationParams>,
    ) -> Result<(), Report<EnsureSystemPoliciesError>> {
        type PolicyParts = (Effect, Vec<ActionName>, Option<ResourceConstraint>);
        // The database enforces a unique constraint on policy names and principals,
        // so we can use a HashMap to group policies by name and principal.
        let mut policy_map: HashMap<String, HashMap<Option<PrincipalConstraint>, PolicyParts>> =
            HashMap::new();

        for mut policy in policies {
            let Some(name) = policy.name.take() else {
                return Err(Report::new(EnsureSystemPoliciesError::MissingPolicyName));
            };
            policy_map.entry(name).or_default().insert(
                policy.principal,
                (policy.effect, policy.actions, policy.resource),
            );
        }

        let mut policies_to_remove = Vec::new();
        let mut policies_to_add = Vec::new();
        let mut policies_to_update = HashMap::new();

        for (name, policies) in policy_map {
            let mut existing_policies = self
                .query_policies(
                    authenticated_actor.into(),
                    &PolicyFilter {
                        name: Some(name.clone()),
                        principal: None,
                    },
                )
                .await
                .change_context(EnsureSystemPoliciesError::ReadPoliciesFailed)?
                .into_iter()
                .map(|policy| {
                    (
                        policy.principal,
                        (policy.id, policy.effect, policy.actions, policy.resource),
                    )
                })
                .collect::<HashMap<_, _>>();

            for (principal, (effect, actions, resource)) in policies {
                let Some((
                    existing_id,
                    existing_effect,
                    existing_actions,
                    existing_resource_constraints,
                )) = existing_policies.remove(&principal)
                else {
                    tracing::debug!(
                        policy_name = name,
                        ?principal,
                        "Marking policy for addition due to missing in store"
                    );
                    policies_to_add.push(PolicyCreationParams {
                        name: Some(name.clone()),
                        effect,
                        principal,
                        actions,
                        resource,
                    });
                    continue;
                };

                if existing_effect != effect {
                    policies_to_update
                        .entry(existing_id)
                        .or_insert_with(Vec::new)
                        .push(PolicyUpdateOperation::SetEffect { effect });
                    tracing::debug!(
                        policy_name = name,
                        ?principal,
                        "Marking policy for update due to effect change"
                    );
                }

                if existing_resource_constraints != resource {
                    policies_to_update
                        .entry(existing_id)
                        .or_insert_with(Vec::new)
                        .push(PolicyUpdateOperation::SetResourceConstraint {
                            resource_constraint: resource,
                        });
                    tracing::debug!(
                        policy_name = name,
                        ?principal,
                        "Marking policy for update due to resource constraint change"
                    );
                }

                let existing_actions_set: HashSet<_> = existing_actions.into_iter().collect();
                let new_actions_set: HashSet<_> = actions.into_iter().collect();

                for action_to_add in new_actions_set.difference(&existing_actions_set) {
                    policies_to_update
                        .entry(existing_id)
                        .or_insert_with(Vec::new)
                        .push(PolicyUpdateOperation::AddAction {
                            action: *action_to_add,
                        });
                    tracing::debug!(
                        policy_name = name,
                        ?principal,
                        action = ?*action_to_add,
                        "Marking policy for adding action due to missing in store"
                    );
                }
                for action_to_remove in existing_actions_set.difference(&new_actions_set) {
                    policies_to_update
                        .entry(existing_id)
                        .or_insert_with(Vec::new)
                        .push(PolicyUpdateOperation::RemoveAction {
                            action: *action_to_remove,
                        });
                    tracing::debug!(
                        policy_name = name,
                        ?principal,
                        action = ?*action_to_remove,
                        "Marking policy for removing action due to no longer being required"
                    );
                }
            }

            // Any remaining policies in `existing_policies` are to be removed
            policies_to_remove.extend(existing_policies.into_iter().map(
                |(principal, (id, _, _, _))| {
                    tracing::debug!(
                        policy_name = name,
                        ?principal,
                        "Marking policy for removal due to no longer being required"
                    );
                    id
                },
            ));
        }

        for policy_id in policies_to_remove {
            self.archive_policy_by_id(authenticated_actor.into(), policy_id)
                .await
                .change_context(EnsureSystemPoliciesError::RemoveOldPolicyFailed)?;
        }
        for policy in policies_to_add {
            self.create_policy(authenticated_actor.into(), policy)
                .await
                .change_context(EnsureSystemPoliciesError::AddRequiredPoliciesFailed)?;
        }
        for (policy_id, operations) in policies_to_update {
            self.update_policy_by_id(authenticated_actor.into(), policy_id, &operations)
                .await
                .change_context(EnsureSystemPoliciesError::UpdatePolicyFailed)?;
        }

        Ok(())
    }
}
