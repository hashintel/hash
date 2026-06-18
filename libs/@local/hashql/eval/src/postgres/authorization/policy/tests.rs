use alloc::alloc::Global;
use std::path::PathBuf;

use hash_graph_authorization::policies::{
    OptimizationData,
    resource::{
        EntityResourceConstraint, EntityResourceFilter, EntityTypeResourceConstraint,
        EntityTypeResourceFilter, ResourceConstraint,
    },
};
use hash_graph_postgres_store::store::postgres::query::Transpile as _;
use hashql_mir::pass::execution::VertexType;
use insta::{Settings, assert_snapshot};
use type_system::{
    knowledge::entity::id::EntityUuid,
    ontology::BaseUrl,
    principal::{
        actor::{ActorId, UserId},
        actor_group::WebId,
    },
};

use super::{
    convert_created_by_principal, convert_entity_resource_filter, convert_is_of_base_type,
    convert_is_of_type, convert_resource_constraint, optimize,
};
use crate::postgres::authorization::tests::{
    ACTOR_UUID, ENTITY_UUID_1, ENTITY_UUID_2, Fixture, WEB_UUID_1, forbid, make_url, permit,
    policy_components,
};

fn snapshot_settings() -> Settings {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(manifest_dir.join("tests/ui/postgres/authorization/policy"));
    settings.set_prepend_module_to_snapshot(false);
    settings
}

#[test]
fn is_of_type_overlap() {
    let mut fixture = Fixture::new();
    let url = make_url("https://hash.ai/@h/types/entity-type/machine/", 1);
    let description = format!("{url:?}");
    let expr = convert_is_of_type(&mut fixture.policy(), url);

    let mut settings = snapshot_settings();
    settings.set_description(description);
    let _guard = settings.bind_to_scope();
    assert_snapshot!("is_of_type_overlap", expr.transpile_to_string());
}

#[test]
fn is_of_base_type_any() {
    let mut fixture = Fixture::new();
    let base = BaseUrl::new("https://hash.ai/@h/types/entity-type/machine/".to_owned())
        .expect("valid base URL");
    let description = format!("{base:?}");
    let expr = convert_is_of_base_type(&mut fixture.policy(), base);

    let mut settings = snapshot_settings();
    settings.set_description(description);
    let _guard = settings.bind_to_scope();
    assert_snapshot!("is_of_base_type_any", expr.transpile_to_string());
}

#[test]
fn created_by_principal_with_actor() {
    let mut fixture = Fixture::new();
    let expr = convert_created_by_principal(&mut fixture.policy());

    let mut settings = snapshot_settings();
    settings.set_description(format!(
        "CreatedByPrincipal, actor = {:?}",
        fixture.policy().actor_id
    ));
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "created_by_principal_with_actor",
        expr.transpile_to_string()
    );
}

#[test]
fn created_by_principal_anonymous() {
    let mut fixture = Fixture::new();
    let expr = convert_created_by_principal(&mut fixture.policy_anon());

    let mut settings = snapshot_settings();
    settings.set_description(format!(
        "CreatedByPrincipal, actor = {:?}",
        fixture.policy_anon().actor_id
    ));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("created_by_principal_anonymous", expr.transpile_to_string());
}

#[test]
fn constraint_exact_entity() {
    let mut fixture = Fixture::new();
    let constraint = ResourceConstraint::Entity(EntityResourceConstraint::Exact {
        id: EntityUuid::new(ENTITY_UUID_1),
    });
    let expr = convert_resource_constraint(&mut fixture.policy(), &constraint);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{constraint:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("constraint_exact_entity", expr.transpile_to_string());
}

#[test]
fn constraint_web() {
    let mut fixture = Fixture::new();
    let constraint = ResourceConstraint::Web {
        web_id: WebId::new(WEB_UUID_1),
    };
    let expr = convert_resource_constraint(&mut fixture.policy(), &constraint);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{constraint:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("constraint_web", expr.transpile_to_string());
}

#[test]
fn constraint_any_with_type_filter() {
    let mut fixture = Fixture::new();
    let constraint = ResourceConstraint::Entity(EntityResourceConstraint::Any {
        filter: EntityResourceFilter::IsOfType {
            entity_type: make_url("https://hash.ai/@h/types/entity-type/user/", 1),
        },
    });
    let expr = convert_resource_constraint(&mut fixture.policy(), &constraint);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{constraint:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "constraint_any_with_type_filter",
        expr.transpile_to_string()
    );
}

#[test]
fn constraint_web_with_created_by() {
    let mut fixture = Fixture::new();
    let constraint = ResourceConstraint::Entity(EntityResourceConstraint::Web {
        web_id: WebId::new(WEB_UUID_1),
        filter: EntityResourceFilter::CreatedByPrincipal,
    });
    let expr = convert_resource_constraint(&mut fixture.policy(), &constraint);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{constraint:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("constraint_web_with_created_by", expr.transpile_to_string());
}

#[test]
fn constraint_non_entity_is_false() {
    let mut fixture = Fixture::new();
    let constraint = ResourceConstraint::EntityType(EntityTypeResourceConstraint::Any {
        filter: EntityTypeResourceFilter::All { filters: vec![] },
    });
    let expr = convert_resource_constraint(&mut fixture.policy(), &constraint);
    assert_eq!(expr.transpile_to_string(), "FALSE");
}

#[test]
fn filter_all_conjunction() {
    let mut fixture = Fixture::new();
    let filter = EntityResourceFilter::All {
        filters: vec![
            EntityResourceFilter::CreatedByPrincipal,
            EntityResourceFilter::IsOfBaseType {
                entity_type: BaseUrl::new("https://hash.ai/@h/types/entity-type/user/".to_owned())
                    .expect("valid base URL"),
            },
        ],
    };
    let expr = convert_entity_resource_filter(&mut fixture.policy(), &filter);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{filter:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("filter_all_conjunction", expr.transpile_to_string());
}

#[test]
fn filter_any_disjunction() {
    let mut fixture = Fixture::new();
    let filter = EntityResourceFilter::Any {
        filters: vec![
            EntityResourceFilter::IsOfType {
                entity_type: make_url("https://hash.ai/@h/types/entity-type/user/", 1),
            },
            EntityResourceFilter::IsOfType {
                entity_type: make_url("https://hash.ai/@h/types/entity-type/machine/", 2),
            },
        ],
    };
    let expr = convert_entity_resource_filter(&mut fixture.policy(), &filter);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{filter:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("filter_any_disjunction", expr.transpile_to_string());
}

#[test]
fn filter_not_negation() {
    let mut fixture = Fixture::new();
    let filter = EntityResourceFilter::Not {
        filter: Box::new(EntityResourceFilter::CreatedByPrincipal),
    };
    let expr = convert_entity_resource_filter(&mut fixture.policy(), &filter);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{filter:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("filter_not_negation", expr.transpile_to_string());
}

#[test]
fn optimize_single_entity_uuid() {
    let mut fixture = Fixture::new();
    let mut unit = fixture.policy();
    let mut permits = None;
    let data = OptimizationData {
        permitted_entity_uuids: vec![EntityUuid::new(ENTITY_UUID_1)],
        permitted_entity_type_uuids: vec![],
        permitted_property_type_uuids: vec![],
        permitted_data_type_uuids: vec![],
        permitted_web_ids: vec![],
    };
    optimize(&mut unit, &mut permits, &data);
    let expr = permits.expect("should have a permit expression");
    assert_eq!(expr.len(), 1);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{data:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("optimize_single_entity", expr[0].transpile_to_string());
}

#[test]
fn optimize_multiple_entity_uuids() {
    let mut fixture = Fixture::new();
    let mut unit = fixture.policy();
    let mut permits = None;
    let data = OptimizationData {
        permitted_entity_uuids: vec![
            EntityUuid::new(ENTITY_UUID_1),
            EntityUuid::new(ENTITY_UUID_2),
        ],
        permitted_entity_type_uuids: vec![],
        permitted_property_type_uuids: vec![],
        permitted_data_type_uuids: vec![],
        permitted_web_ids: vec![],
    };
    optimize(&mut unit, &mut permits, &data);
    let expr = permits.expect("should have a permit expression");
    assert_eq!(expr.len(), 1);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{data:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("optimize_multiple_entities", expr[0].transpile_to_string());
}

#[test]
fn optimize_single_web_id() {
    let mut fixture = Fixture::new();
    let mut unit = fixture.policy();
    let mut permits = None;
    let data = OptimizationData {
        permitted_entity_uuids: vec![],
        permitted_entity_type_uuids: vec![],
        permitted_property_type_uuids: vec![],
        permitted_data_type_uuids: vec![],
        permitted_web_ids: vec![WebId::new(WEB_UUID_1)],
    };
    optimize(&mut unit, &mut permits, &data);
    let expr = permits.expect("should have a permit expression");
    assert_eq!(expr.len(), 1);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{data:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("optimize_single_web", expr[0].transpile_to_string());
}

#[test]
fn optimize_empty_is_noop() {
    let mut fixture = Fixture::new();
    let mut unit = fixture.policy();
    let mut permits = None;
    let data = OptimizationData::default();
    optimize(&mut unit, &mut permits, &data);
    assert!(
        permits.is_none(),
        "empty optimization should not add permits"
    );
}

#[test]
fn algebra_blank_forbid_denies_all() {
    let mut fixture = Fixture::new();
    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policy = policy_components(actor, vec![forbid(|| None)]);
    let result = fixture
        .policy()
        .transpile(VertexType::Entity, &policy, Global);
    assert_eq!(result.condition.transpile_to_string(), "FALSE");
}

#[test]
fn algebra_blank_permit_allows_all() {
    let mut fixture = Fixture::new();
    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policy = policy_components(actor, vec![permit(|| None)]);
    let result = fixture
        .policy()
        .transpile(VertexType::Entity, &policy, Global);
    assert_eq!(result.condition.transpile_to_string(), "TRUE");
}

#[test]
fn algebra_blank_permit_with_forbids() {
    let mut fixture = Fixture::new();
    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policies = vec![
        permit(|| None),
        forbid(|| {
            Some(ResourceConstraint::Web {
                web_id: WebId::new(WEB_UUID_1),
            })
        }),
    ];
    let description = format!(
        "{:?}",
        policies.iter().map(|policy| policy()).collect::<Vec<_>>()
    );
    let policy = policy_components(actor, policies);
    let result = fixture
        .policy()
        .transpile(VertexType::Entity, &policy, Global);

    let mut settings = snapshot_settings();
    settings.set_description(description);
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "algebra_blank_permit_with_forbids",
        result.condition.transpile_to_string()
    );
}

#[test]
fn algebra_no_permits_denies_all() {
    let mut fixture = Fixture::new();
    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policy = policy_components(
        actor,
        vec![forbid(|| {
            Some(ResourceConstraint::Web {
                web_id: WebId::new(WEB_UUID_1),
            })
        })],
    );
    let result = fixture
        .policy()
        .transpile(VertexType::Entity, &policy, Global);
    assert_eq!(
        result.condition.transpile_to_string(),
        "FALSE",
        "forbids without permits should deny all",
    );
}

#[test]
fn algebra_constrained_permits_only() {
    let mut fixture = Fixture::new();
    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policies = vec![
        permit(|| {
            Some(ResourceConstraint::Entity(
                EntityResourceConstraint::Exact {
                    id: EntityUuid::new(ENTITY_UUID_1),
                },
            ))
        }),
        permit(|| {
            Some(ResourceConstraint::Web {
                web_id: WebId::new(WEB_UUID_1),
            })
        }),
    ];
    let description = format!(
        "{:?}",
        policies.iter().map(|policy| policy()).collect::<Vec<_>>()
    );
    let policy = policy_components(actor, policies);
    let result = fixture
        .policy()
        .transpile(VertexType::Entity, &policy, Global);

    let mut settings = snapshot_settings();
    settings.set_description(description);
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "algebra_constrained_permits_only",
        result.condition.transpile_to_string(),
    );
}

#[test]
fn algebra_permits_and_forbids() {
    let mut fixture = Fixture::new();
    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));
    let policies = vec![
        permit(|| {
            Some(ResourceConstraint::Entity(
                EntityResourceConstraint::Exact {
                    id: EntityUuid::new(ENTITY_UUID_1),
                },
            ))
        }),
        forbid(|| {
            Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::IsOfType {
                    entity_type: make_url("https://hash.ai/@h/types/entity-type/user/", 1),
                },
            }))
        }),
    ];
    let description = format!(
        "{:?}",
        policies.iter().map(|policy| policy()).collect::<Vec<_>>()
    );
    let policy = policy_components(actor, policies);
    let result = fixture
        .policy()
        .transpile(VertexType::Entity, &policy, Global);

    let mut settings = snapshot_settings();
    settings.set_description(description);
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "algebra_permits_and_forbids",
        result.condition.transpile_to_string(),
    );
}

#[test]
fn algebra_blank_forbid_preserves_prior_projections() {
    let mut fixture = Fixture::new();
    let actor = Some(ActorId::User(UserId::new(ACTOR_UUID)));

    // First transpile registers entity_ids via CreatedByPrincipal.
    let first_policy = policy_components(
        actor,
        vec![permit(|| {
            Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::CreatedByPrincipal,
            }))
        })],
    );
    let first_result = fixture
        .policy()
        .transpile(VertexType::Entity, &first_policy, Global);
    assert_ne!(
        first_result.condition.transpile_to_string(),
        "FALSE",
        "first transpile should produce a real condition",
    );
    assert!(
        fixture.projections.entity_ids.is_some(),
        "CreatedByPrincipal should register entity_ids",
    );
    let entity_ids_alias = fixture.projections.entity_ids;

    // Second transpile with blank forbid should deny all but preserve
    // the entity_ids projection registered by the first call.
    let second_policy = policy_components(actor, vec![forbid(|| None)]);
    let second_result = fixture
        .policy()
        .transpile(VertexType::Entity, &second_policy, Global);
    assert_eq!(second_result.condition.transpile_to_string(), "FALSE");
    assert_eq!(
        fixture.projections.entity_ids, entity_ids_alias,
        "blank forbid should preserve pre-existing projections",
    );
}
