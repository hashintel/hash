use core::iter;

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
            PolicyCreationParams, PolicyFilter, PolicyStore as _, PrincipalFilter,
            error::EnsureSystemPoliciesError,
        },
    },
};
use type_system::{
    ontology::{BaseUrl, VersionedUrl, id::OntologyTypeVersion},
    principal::{
        actor::{ActorId, ActorType},
        role::{RoleId, TeamRole, WebRole},
    },
};

use super::{AsClient, PostgresStore};

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

    (1..=max_version).filter_map(move |version| {
        Some(EntityResourceFilter::IsOfType {
            entity_type: VersionedUrl {
                base_url: if version < max_version {
                    base_url.as_ref()?.clone()
                } else {
                    base_url.take()?
                },
                version: OntologyTypeVersion::new(version),
            },
        })
    })
}

pub(crate) fn system_actor_create_web_policy(
    system_machine_actor: ActorId,
) -> PolicyCreationParams {
    PolicyCreationParams {
        name: Some("default-web-create".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: system_machine_actor,
        }),
        actions: vec![ActionName::CreateWeb],
        resource: None,
    }
}

fn system_actor_view_entity_policies(
    system_machine_actor: ActorId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("default-web-create".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: system_machine_actor,
        }),
        actions: vec![ActionName::CreateWeb],
        resource: None,
    })
}

pub(crate) fn system_actor_policies(
    system_machine_actor: ActorId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(system_actor_create_web_policy(system_machine_actor))
        .chain(system_actor_view_entity_policies(system_machine_actor))
}

fn global_instantiate_policies() -> impl Iterator<Item = PolicyCreationParams> {
    fn common_filters() -> impl Iterator<Item = EntityTypeResourceFilter> {
        [
            EntityTypeResourceFilter::IsBaseUrl {
                base_url: base_url!("https://hash.ai/@h/types/entity-type/actor/"),
            },
            EntityTypeResourceFilter::IsBaseUrl {
                base_url: base_url!("https://hash.ai/@h/types/entity-type/machine/"),
            },
            EntityTypeResourceFilter::IsBaseUrl {
                base_url: base_url!("https://hash.ai/@h/types/entity-type/user/"),
            },
            EntityTypeResourceFilter::IsBaseUrl {
                base_url: base_url!("https://hash.ai/@h/types/entity-type/organization/"),
            },
        ]
        .into_iter()
    }

    let authenticated_policies = [ActorType::User, ActorType::Machine, ActorType::Ai]
        .into_iter()
        .map(|actor_type| PolicyCreationParams {
            name: Some("authenticated-instantiate".to_owned()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::ActorType { actor_type }),
            actions: vec![ActionName::Instantiate],
            resource: Some(ResourceConstraint::EntityType(
                EntityTypeResourceConstraint::Any {
                    filter: EntityTypeResourceFilter::Not {
                        filter: Box::new(EntityTypeResourceFilter::Any {
                            filters: iter::once(EntityTypeResourceFilter::IsBaseUrl {
                                base_url: base_url!(
                                    "https://hash.ai/@h/types/entity-type/hash-instance/"
                                ),
                            })
                            .chain(common_filters())
                            .collect(),
                        }),
                    },
                },
            )),
        });

    let machine_only_policies = iter::once(PolicyCreationParams {
        name: Some("machine-only-instantiate".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::ActorType {
            actor_type: ActorType::Machine,
        }),
        actions: vec![ActionName::Instantiate],
        resource: Some(ResourceConstraint::EntityType(
            EntityTypeResourceConstraint::Any {
                filter: EntityTypeResourceFilter::Not {
                    filter: Box::new(EntityTypeResourceFilter::Any {
                        filters: common_filters().collect(),
                    }),
                },
            },
        )),
    });

    authenticated_policies.chain(machine_only_policies)
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
                    6,
                ))
                .chain(create_version_filters(
                    base_url!("https://hash.ai/@h/types/entity-type/organization/"),
                    2,
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
            filter: EntityResourceFilter::Not {
                filter: Box::new(EntityResourceFilter::Any {
                    filters: create_version_filters(
                        base_url!("https://hash.ai/@h/types/entity-type/user-secret/"),
                        1,
                    )
                    .chain(create_version_filters(
                        base_url!("https://hash.ai/@h/types/entity-type/usage-record/"),
                        2,
                    ))
                    .collect(),
                }),
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

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi + Send + Sync,
{
    pub(crate) async fn update_seeded_policies(
        &mut self,
        authenticated_actor: ActorId,
        policies: impl IntoIterator<Item = PolicyCreationParams>,
    ) -> Result<(), Report<EnsureSystemPoliciesError>> {
        for policy in policies {
            let Some(policy_name) = &policy.name else {
                return Err(Report::new(EnsureSystemPoliciesError::MissingPolicyName));
            };

            let existing_policies = self
                .query_policies(
                    authenticated_actor.into(),
                    &PolicyFilter {
                        name: Some(policy_name.clone()),
                        principal: Some(
                            policy.principal.clone().map_or(
                                PrincipalFilter::Unconstrained,
                                PrincipalFilter::Constrained,
                            ),
                        ),
                    },
                )
                .await
                .change_context(EnsureSystemPoliciesError::ReadPoliciesFailed)?;

            for policy in &existing_policies {
                self.delete_policy_by_id(authenticated_actor.into(), policy.id)
                    .await
                    .change_context(EnsureSystemPoliciesError::RemoveOldPolicyFailed)?;
            }

            self.create_policy(authenticated_actor.into(), policy)
                .await
                .change_context(EnsureSystemPoliciesError::AddRequiredPoliciesFailed)?;
        }

        Ok(())
    }
}
