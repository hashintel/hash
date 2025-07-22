use core::iter;
use std::{
    collections::{HashMap, HashSet},
    sync::LazyLock,
};

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::{
    Effect,
    action::ActionName,
    principal::PrincipalConstraint,
    resource::{
        DataTypeResourceConstraint, DataTypeResourceFilter, EntityResourceConstraint,
        EntityResourceFilter, EntityTypeResourceConstraint, EntityTypeResourceFilter,
        MetaResourceConstraint, MetaResourceFilter, PropertyTypeResourceConstraint,
        PropertyTypeResourceFilter, ResourceConstraint,
    },
    store::{
        PolicyCreationParams, PolicyFilter, PolicyUpdateOperation, error::EnsureSystemPoliciesError,
    },
};
use tokio_postgres::Transaction;
use type_system::{
    ontology::BaseUrl,
    principal::{
        actor::{ActorId, ActorType, MachineId},
        role::{RoleId, RoleName, TeamRole, WebRole},
    },
};

use super::PostgresStore;

struct EntityTypeConfig {
    base_url: BaseUrl,
}

impl EntityTypeConfig {
    fn new(base_url: &'static str) -> Self {
        Self {
            base_url: BaseUrl::new(base_url.to_owned()).expect("should be a valid base URL"),
        }
    }

    fn entity_is_of_base_type(&self) -> EntityResourceFilter {
        EntityResourceFilter::IsOfBaseType {
            entity_type: self.base_url.clone(),
        }
    }

    fn entity_type_is_base_url(&self) -> EntityTypeResourceFilter {
        EntityTypeResourceFilter::IsBaseUrl {
            base_url: self.base_url.clone(),
        }
    }
}

static HASH_INSTANCE: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/hash-instance/"));

static USER: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/user/"));
static PROSPECTIVE_USER: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/prospective-user/")
});
static ACTOR: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/actor/"));
static ORGANIZATION: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/organization/"));
static IS_MEMBER_OF: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/is-member-of/"));
static MACHINE: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/machine/"));
static COMMENT: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/comment/"));
static INVITATION_VIA_EMAIL: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/invitation-via-email/")
});
static INVITATION_VIA_SHORTNAME: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/invitation-via-shortname/")
});
static HAS_ISSUED_INVITATION: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/has-issued-invitation/")
});

static SERVICE_FEATURE: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/service-feature/")
});
static USAGE_RECORD: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/usage-record/"));
static INCURRED_IN: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/incurred-in/"));
static RECORDS_USAGE_OF: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/records-usage-of/")
});

static USER_SECRET: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/user-secret/"));

static SYNC_LINEAR_DATA_WITH: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/sync-linear-data-with/")
});

static NOTIFICATION: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/notification/"));
static GRAPH_CHANGE_NOTIFICATION: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/graph-change-notification/")
});
static COMMENT_NOTIFICATION: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/comment-notification/")
});
static MENTION_NOTIFICATION: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/mention-notification/")
});

static TRIGGERED_BY_USER: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/triggered-by-user/")
});
static OCCURRED_IN_BLOCK: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/occurred-in-block/")
});
static OCCURRED_IN_ENTITY: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/occurred-in-entity/")
});
static OCCURRED_IN_COMMENT: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/occurred-in-comment/")
});
static OCCURRED_IN_TEXT: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/occurred-in-text/")
});

static GOOGLE_ACCOUNT: LazyLock<EntityTypeConfig> =
    LazyLock::new(|| EntityTypeConfig::new("https://hash.ai/@google/types/entity-type/account/"));
static LINEAR_INTEGRATION: LazyLock<EntityTypeConfig> = LazyLock::new(|| {
    EntityTypeConfig::new("https://hash.ai/@h/types/entity-type/linear-integration/")
});

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

pub(crate) fn system_actor_meta_policy(system_machine_actor: MachineId) -> PolicyCreationParams {
    // We create a few temporary policies in the Node API. To allow those to be created,
    // we need to allow the system machine to create these policies.
    PolicyCreationParams {
        name: Some("system-machine-meta-policy".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: ActorId::Machine(system_machine_actor),
        }),
        actions: vec![ActionName::CreatePolicy, ActionName::DeletePolicy],
        resource: Some(ResourceConstraint::Meta(MetaResourceConstraint::Any {
            filter: MetaResourceFilter::HasAction {
                action: ActionName::Instantiate,
            },
        })),
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
                filters: vec![
                    SYNC_LINEAR_DATA_WITH.entity_is_of_base_type(),
                    PROSPECTIVE_USER.entity_is_of_base_type(),
                ],
            },
        })),
    })
}

fn system_actor_invitation_entity_policies(
    system_machine_actor: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("system-machine-invitation-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: ActorId::Machine(system_machine_actor),
        }),
        actions: vec![ActionName::ViewEntity, ActionName::ArchiveEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: EntityResourceFilter::Any {
                filters: vec![
                    INVITATION_VIA_EMAIL.entity_is_of_base_type(),
                    INVITATION_VIA_SHORTNAME.entity_is_of_base_type(),
                    HAS_ISSUED_INVITATION.entity_is_of_base_type(),
                ],
            },
        })),
    })
}

pub(crate) fn system_actor_policies(
    system_machine_actor: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(system_actor_create_web_policy(system_machine_actor))
        .chain(system_actor_view_entity_policies(system_machine_actor))
        .chain(system_actor_invitation_entity_policies(
            system_machine_actor,
        ))
        .chain(iter::once(system_actor_meta_policy(system_machine_actor)))
}

fn google_bot_view_entity_policies(
    google_bot_machine: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("google-bot-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: ActorId::Machine(google_bot_machine),
        }),
        actions: vec![ActionName::ViewEntity, ActionName::UpdateEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: GOOGLE_ACCOUNT.entity_is_of_base_type(),
        })),
    })
}

pub(crate) fn google_bot_policies(
    google_bot_machine: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    google_bot_view_entity_policies(google_bot_machine)
}

pub(crate) fn linear_bot_created_entity_policies(
    linear_bot_machine: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("linear-bot-created-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: ActorId::Machine(linear_bot_machine),
        }),
        actions: vec![
            ActionName::ViewEntity,
            ActionName::UpdateEntity,
            ActionName::ArchiveEntity,
        ],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: EntityResourceFilter::CreatedByPrincipal,
        })),
    })
}

pub(crate) fn linear_bot_view_entity_policies(
    linear_bot_machine: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("linear-bot-view-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Actor {
            actor: ActorId::Machine(linear_bot_machine),
        }),
        actions: vec![ActionName::ViewEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: EntityResourceFilter::Any {
                filters: vec![
                    LINEAR_INTEGRATION.entity_is_of_base_type(),
                    SYNC_LINEAR_DATA_WITH.entity_is_of_base_type(),
                ],
            },
        })),
    })
}

pub(crate) fn linear_bot_policies(
    linear_bot_machine: MachineId,
) -> impl Iterator<Item = PolicyCreationParams> {
    linear_bot_created_entity_policies(linear_bot_machine)
        .chain(linear_bot_view_entity_policies(linear_bot_machine))
}

fn global_meta_policies() -> impl Iterator<Item = PolicyCreationParams> {
    [ActorType::User, ActorType::Machine, ActorType::Ai]
        .into_iter()
        .map(|actor_type| PolicyCreationParams {
            name: Some("authenticated-view-meta".to_owned()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::ActorType { actor_type }),
            actions: vec![ActionName::ViewPolicy],
            resource: Some(ResourceConstraint::Meta(MetaResourceConstraint::Any {
                filter: MetaResourceFilter::All { filters: vec![] },
            })),
        })
        .chain(iter::once(PolicyCreationParams {
            name: Some("global-forbid-meta".to_owned()),
            effect: Effect::Forbid,
            principal: None,
            actions: vec![
                ActionName::CreatePolicy,
                ActionName::UpdatePolicy,
                ActionName::ArchivePolicy,
                ActionName::DeletePolicy,
            ],
            resource: Some(ResourceConstraint::Meta(MetaResourceConstraint::Any {
                filter: MetaResourceFilter::Any {
                    filters: vec![
                        MetaResourceFilter::HasAction {
                            action: ActionName::CreateWeb,
                        },
                        MetaResourceFilter::HasAction {
                            action: ActionName::DeletePolicy,
                        },
                        MetaResourceFilter::HasAction {
                            action: ActionName::ViewEntityType,
                        },
                        MetaResourceFilter::HasAction {
                            action: ActionName::ViewPropertyType,
                        },
                        MetaResourceFilter::HasAction {
                            action: ActionName::ViewDataType,
                        },
                    ],
                },
            })),
        }))
}

fn global_instantiate_policies() -> impl Iterator<Item = PolicyCreationParams> {
    [ActorType::User, ActorType::Machine, ActorType::Ai]
        .into_iter()
        .map(|actor_type| {
            let mut filters = vec![HASH_INSTANCE.entity_type_is_base_url()];
            if actor_type != ActorType::Machine {
                filters.extend([
                    ACTOR.entity_type_is_base_url(),
                    ORGANIZATION.entity_type_is_base_url(),
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
                filters: vec![
                    HASH_INSTANCE.entity_is_of_base_type(),
                    USER.entity_is_of_base_type(),
                    ORGANIZATION.entity_is_of_base_type(),
                ],
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
                    filters: vec![
                        MACHINE.entity_is_of_base_type(),
                        SERVICE_FEATURE.entity_is_of_base_type(),
                        IS_MEMBER_OF.entity_is_of_base_type(),
                    ],
                },
            })),
        });

    public_policies.chain(authenticated_actor_policies)
}

fn global_view_ontology_policies() -> impl Iterator<Item = PolicyCreationParams> {
    [ActorType::User, ActorType::Machine]
        .into_iter()
        .flat_map(|actor_type| {
            [
                PolicyCreationParams {
                    name: Some("authenticated-create-external-entity-types".to_owned()),
                    effect: Effect::Permit,
                    principal: Some(PrincipalConstraint::ActorType { actor_type }),
                    actions: vec![ActionName::CreateEntityType],
                    resource: Some(ResourceConstraint::EntityType(
                        EntityTypeResourceConstraint::Any {
                            filter: EntityTypeResourceFilter::IsRemote,
                        },
                    )),
                },
                PolicyCreationParams {
                    name: Some("authenticated-create-external-property-types".to_owned()),
                    effect: Effect::Permit,
                    principal: Some(PrincipalConstraint::ActorType { actor_type }),
                    actions: vec![ActionName::CreatePropertyType],
                    resource: Some(ResourceConstraint::PropertyType(
                        PropertyTypeResourceConstraint::Any {
                            filter: PropertyTypeResourceFilter::IsRemote,
                        },
                    )),
                },
                PolicyCreationParams {
                    name: Some("authenticated-create-external-data-types".to_owned()),
                    effect: Effect::Permit,
                    principal: Some(PrincipalConstraint::ActorType { actor_type }),
                    actions: vec![ActionName::CreateDataType],
                    resource: Some(ResourceConstraint::DataType(
                        DataTypeResourceConstraint::Any {
                            filter: DataTypeResourceFilter::IsRemote,
                        },
                    )),
                },
            ]
        })
        .chain(iter::once(PolicyCreationParams {
            name: Some("public-view-ontology".to_owned()),
            effect: Effect::Permit,
            principal: None,
            actions: vec![
                ActionName::ViewEntityType,
                ActionName::ViewPropertyType,
                ActionName::ViewDataType,
            ],
            resource: None,
        }))
}

fn global_update_entity_policies() -> impl Iterator<Item = PolicyCreationParams> {
    [
        PolicyCreationParams {
            name: Some("user-creator-update-entity".to_owned()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::ActorType {
                actor_type: ActorType::User,
            }),
            actions: vec![ActionName::UpdateEntity],
            resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::All {
                    filters: vec![
                        EntityResourceFilter::CreatedByPrincipal,
                        EntityResourceFilter::Any {
                            filters: vec![COMMENT.entity_is_of_base_type()],
                        },
                    ],
                },
            })),
        },
        PolicyCreationParams {
            name: Some("machine-creator-update-entity".to_owned()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::ActorType {
                actor_type: ActorType::Machine,
            }),
            actions: vec![ActionName::UpdateEntity],
            resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::All {
                    filters: vec![
                        EntityResourceFilter::CreatedByPrincipal,
                        EntityResourceFilter::Any {
                            filters: vec![
                                MACHINE.entity_is_of_base_type(),
                                NOTIFICATION.entity_is_of_base_type(),
                                GRAPH_CHANGE_NOTIFICATION.entity_is_of_base_type(),
                                COMMENT_NOTIFICATION.entity_is_of_base_type(),
                                MENTION_NOTIFICATION.entity_is_of_base_type(),
                                TRIGGERED_BY_USER.entity_is_of_base_type(),
                                OCCURRED_IN_BLOCK.entity_is_of_base_type(),
                                OCCURRED_IN_ENTITY.entity_is_of_base_type(),
                                OCCURRED_IN_COMMENT.entity_is_of_base_type(),
                                OCCURRED_IN_TEXT.entity_is_of_base_type(),
                            ],
                        },
                    ],
                },
            })),
        },
    ]
    .into_iter()
}

fn global_archive_entity_policies() -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("user-creator-archive-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::ActorType {
            actor_type: ActorType::User,
        }),
        actions: vec![ActionName::ArchiveEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: EntityResourceFilter::All {
                filters: vec![
                    EntityResourceFilter::CreatedByPrincipal,
                    COMMENT.entity_is_of_base_type(),
                ],
            },
        })),
    })
}

pub(crate) fn global_policies() -> impl Iterator<Item = PolicyCreationParams> {
    global_meta_policies()
        .chain(global_instantiate_policies())
        .chain(global_view_entity_policies())
        .chain(global_view_ontology_policies())
        .chain(global_update_entity_policies())
        .chain(global_archive_entity_policies())
}

fn web_meta_admin_policies(role: &WebRole) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("default-web-meta".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Role {
            role: RoleId::Web(role.id),
            actor_type: None,
        }),
        actions: vec![
            ActionName::CreatePolicy,
            ActionName::UpdatePolicy,
            ActionName::ArchivePolicy,
        ],
        resource: Some(ResourceConstraint::Meta(MetaResourceConstraint::Web {
            web_id: role.web_id,
            filter: MetaResourceFilter::All { filters: vec![] },
        })),
    })
}

fn web_create_entity_policies(role: &WebRole) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("default-web-create-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Role {
            role: RoleId::Web(role.id),
            actor_type: None,
        }),
        actions: vec![ActionName::CreateEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Web {
            web_id: role.web_id,
            filter: match role.name {
                RoleName::Administrator => EntityResourceFilter::All { filters: vec![] },
                RoleName::Member => EntityResourceFilter::Not {
                    filter: Box::new(EntityResourceFilter::Any {
                        filters: vec![
                            // Only admins can invite actors to an organization
                            IS_MEMBER_OF.entity_is_of_base_type(),
                        ],
                    }),
                },
            },
        })),
    })
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
                                filters: vec![
                                    USER_SECRET.entity_is_of_base_type(),
                                    USAGE_RECORD.entity_is_of_base_type(),
                                    INCURRED_IN.entity_is_of_base_type(),
                                    RECORDS_USAGE_OF.entity_is_of_base_type(),
                                ],
                            }),
                        },
                    ],
                },
            },
        })),
    })
}

fn web_update_entity_policies(role: &WebRole) -> impl Iterator<Item = PolicyCreationParams> {
    let mut policies = vec![PolicyCreationParams {
        name: Some("default-web-update-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Role {
            role: RoleId::Web(role.id),
            actor_type: None,
        }),
        actions: vec![ActionName::UpdateEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Web {
            web_id: role.web_id,
            filter: match role.name {
                RoleName::Administrator => EntityResourceFilter::Not {
                    filter: Box::new(EntityResourceFilter::Any {
                        filters: vec![
                            MACHINE.entity_is_of_base_type(),
                            PROSPECTIVE_USER.entity_is_of_base_type(),
                            USAGE_RECORD.entity_is_of_base_type(),
                            INCURRED_IN.entity_is_of_base_type(),
                            NOTIFICATION.entity_is_of_base_type(),
                            GRAPH_CHANGE_NOTIFICATION.entity_is_of_base_type(),
                            COMMENT_NOTIFICATION.entity_is_of_base_type(),
                            MENTION_NOTIFICATION.entity_is_of_base_type(),
                            TRIGGERED_BY_USER.entity_is_of_base_type(),
                            OCCURRED_IN_BLOCK.entity_is_of_base_type(),
                            OCCURRED_IN_ENTITY.entity_is_of_base_type(),
                            OCCURRED_IN_COMMENT.entity_is_of_base_type(),
                            OCCURRED_IN_TEXT.entity_is_of_base_type(),
                            GOOGLE_ACCOUNT.entity_is_of_base_type(),
                        ],
                    }),
                },
                RoleName::Member => EntityResourceFilter::Not {
                    filter: Box::new(EntityResourceFilter::Any {
                        filters: vec![
                            MACHINE.entity_is_of_base_type(),
                            ORGANIZATION.entity_is_of_base_type(),
                            PROSPECTIVE_USER.entity_is_of_base_type(),
                            USAGE_RECORD.entity_is_of_base_type(),
                            INCURRED_IN.entity_is_of_base_type(),
                            COMMENT.entity_is_of_base_type(),
                            IS_MEMBER_OF.entity_is_of_base_type(),
                            NOTIFICATION.entity_is_of_base_type(),
                            GRAPH_CHANGE_NOTIFICATION.entity_is_of_base_type(),
                            COMMENT_NOTIFICATION.entity_is_of_base_type(),
                            MENTION_NOTIFICATION.entity_is_of_base_type(),
                            TRIGGERED_BY_USER.entity_is_of_base_type(),
                            OCCURRED_IN_BLOCK.entity_is_of_base_type(),
                            OCCURRED_IN_ENTITY.entity_is_of_base_type(),
                            OCCURRED_IN_COMMENT.entity_is_of_base_type(),
                            OCCURRED_IN_TEXT.entity_is_of_base_type(),
                            GOOGLE_ACCOUNT.entity_is_of_base_type(),
                            LINEAR_INTEGRATION.entity_is_of_base_type(),
                            SYNC_LINEAR_DATA_WITH.entity_is_of_base_type(),
                        ],
                    }),
                },
            },
        })),
    }];

    // Required to update entities for the web-bot
    if role.name == RoleName::Member {
        policies.push(PolicyCreationParams {
            name: Some("default-web-update-entity".to_owned()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Role {
                role: RoleId::Web(role.id),
                actor_type: Some(ActorType::Machine),
            }),
            actions: vec![ActionName::UpdateEntity],
            resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id: role.web_id,
                filter: EntityResourceFilter::IsOfBaseType {
                    entity_type: ORGANIZATION.base_url.clone(),
                },
            })),
        });
    }
    policies.into_iter()
}

fn web_archive_entity_policies(role: &WebRole) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("default-web-archive-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Role {
            role: RoleId::Web(role.id),
            actor_type: None,
        }),
        actions: vec![ActionName::ArchiveEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Web {
            web_id: role.web_id,
            filter: match role.name {
                RoleName::Administrator => EntityResourceFilter::Not {
                    filter: Box::new(EntityResourceFilter::Any {
                        filters: vec![
                            MACHINE.entity_is_of_base_type(),
                            ORGANIZATION.entity_is_of_base_type(),
                            PROSPECTIVE_USER.entity_is_of_base_type(),
                            USAGE_RECORD.entity_is_of_base_type(),
                            INCURRED_IN.entity_is_of_base_type(),
                            TRIGGERED_BY_USER.entity_is_of_base_type(),
                            OCCURRED_IN_BLOCK.entity_is_of_base_type(),
                            OCCURRED_IN_ENTITY.entity_is_of_base_type(),
                            OCCURRED_IN_COMMENT.entity_is_of_base_type(),
                            OCCURRED_IN_TEXT.entity_is_of_base_type(),
                            GOOGLE_ACCOUNT.entity_is_of_base_type(),
                        ],
                    }),
                },
                RoleName::Member => EntityResourceFilter::Not {
                    filter: Box::new(EntityResourceFilter::Any {
                        filters: vec![
                            MACHINE.entity_is_of_base_type(),
                            ORGANIZATION.entity_is_of_base_type(),
                            PROSPECTIVE_USER.entity_is_of_base_type(),
                            USAGE_RECORD.entity_is_of_base_type(),
                            INCURRED_IN.entity_is_of_base_type(),
                            COMMENT.entity_is_of_base_type(),
                            IS_MEMBER_OF.entity_is_of_base_type(),
                            TRIGGERED_BY_USER.entity_is_of_base_type(),
                            OCCURRED_IN_BLOCK.entity_is_of_base_type(),
                            OCCURRED_IN_ENTITY.entity_is_of_base_type(),
                            OCCURRED_IN_COMMENT.entity_is_of_base_type(),
                            OCCURRED_IN_TEXT.entity_is_of_base_type(),
                            GOOGLE_ACCOUNT.entity_is_of_base_type(),
                            LINEAR_INTEGRATION.entity_is_of_base_type(),
                            SYNC_LINEAR_DATA_WITH.entity_is_of_base_type(),
                        ],
                    }),
                },
            },
        })),
    })
}
fn web_crud_ontology_policies(role: &WebRole) -> impl Iterator<Item = PolicyCreationParams> {
    let mut filters = vec![
        PolicyCreationParams {
            name: Some("default-create-web-ontology".to_owned()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Role {
                role: RoleId::Web(role.id),
                actor_type: None,
            }),
            actions: vec![
                ActionName::CreateEntityType,
                ActionName::CreatePropertyType,
                ActionName::CreateDataType,
            ],
            resource: Some(ResourceConstraint::Web {
                web_id: role.web_id,
            }),
        },
        PolicyCreationParams {
            name: Some("default-update-web-ontology".to_owned()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Role {
                role: RoleId::Web(role.id),
                actor_type: None,
            }),
            actions: vec![
                ActionName::UpdateEntityType,
                ActionName::UpdatePropertyType,
                ActionName::UpdateDataType,
            ],
            resource: Some(ResourceConstraint::Web {
                web_id: role.web_id,
            }),
        },
    ];

    if role.name == RoleName::Administrator {
        filters.push(PolicyCreationParams {
            name: Some("default-archive-web-ontology".to_owned()),
            effect: Effect::Permit,
            principal: Some(PrincipalConstraint::Role {
                role: RoleId::Web(role.id),
                actor_type: None,
            }),
            actions: vec![
                ActionName::ArchiveEntityType,
                ActionName::ArchivePropertyType,
                ActionName::ArchiveDataType,
            ],
            resource: Some(ResourceConstraint::Web {
                web_id: role.web_id,
            }),
        });
    }

    filters.into_iter()
}

// TODO: Returning an iterator causes a borrow checker error
pub(crate) fn web_policies(role: &WebRole) -> Vec<PolicyCreationParams> {
    let mut policies = web_create_entity_policies(role)
        .chain(web_view_entity_policies(role))
        .chain(web_update_entity_policies(role))
        .chain(web_archive_entity_policies(role))
        .chain(web_crud_ontology_policies(role))
        .collect::<Vec<_>>();
    if role.name == RoleName::Administrator {
        policies.extend(web_meta_admin_policies(role));
    }
    policies
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
                filters: vec![
                    INCURRED_IN.entity_is_of_base_type(),
                    USAGE_RECORD.entity_is_of_base_type(),
                    RECORDS_USAGE_OF.entity_is_of_base_type(),
                    PROSPECTIVE_USER.entity_is_of_base_type(),
                ],
            },
        })),
    })
}

fn instance_admins_update_entity_policy(
    role: &TeamRole,
) -> impl Iterator<Item = PolicyCreationParams> {
    iter::once(PolicyCreationParams {
        name: Some("hash-admins-update-entity".to_owned()),
        effect: Effect::Permit,
        principal: Some(PrincipalConstraint::Role {
            role: RoleId::Team(role.id),
            actor_type: None,
        }),
        actions: vec![ActionName::UpdateEntity],
        resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
            filter: EntityResourceFilter::Any {
                filters: vec![
                    HASH_INSTANCE.entity_is_of_base_type(),
                    USER.entity_is_of_base_type(),
                    USAGE_RECORD.entity_is_of_base_type(),
                ],
            },
        })),
    })
}

// TODO: Returning an iterator causes a borrow checker error, even if using `+ use<'_>`
pub(crate) fn instance_admins_policies(role: &TeamRole) -> Vec<PolicyCreationParams> {
    instance_admins_view_entity_policy(role)
        .chain(instance_admins_update_entity_policy(role))
        .collect()
}

impl PostgresStore<Transaction<'_>> {
    #[expect(clippy::too_many_lines)]
    pub(crate) async fn update_seeded_policies(
        &mut self,
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
                .read_policies_from_database(&PolicyFilter {
                    name: Some(name.clone()),
                    principal: None,
                })
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

        for (index, policy_id) in policies_to_remove.iter().enumerate() {
            tracing::debug!(
                %policy_id,
                "Removing policy from database {index}/{}",
                policies_to_remove.len()
            );
            self.archive_policy_from_database(*policy_id)
                .await
                .change_context(EnsureSystemPoliciesError::RemoveOldPolicyFailed)?;
        }
        for (index, policy) in policies_to_add.iter().enumerate() {
            tracing::debug!(
                policy_name = policy.name,
                "Adding policy to database {index}/{}",
                policies_to_add.len()
            );
            self.insert_policy_into_database(policy)
                .await
                .change_context(EnsureSystemPoliciesError::AddRequiredPoliciesFailed)?;
        }
        for (index, (policy_id, operations)) in policies_to_update.iter().enumerate() {
            tracing::debug!(
                %policy_id,
                "Updating policy in database {index}/{}",
                policies_to_update.len()
            );
            self.update_policy_in_database(*policy_id, operations)
                .await
                .change_context(EnsureSystemPoliciesError::UpdatePolicyFailed)?;
        }

        Ok(())
    }
}
