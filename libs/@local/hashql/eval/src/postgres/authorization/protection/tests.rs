use alloc::borrow::Cow;
use std::path::PathBuf;

use hash_graph_postgres_store::store::postgres::query::Transpile as _;
use hash_graph_store::filter::{
    Parameter,
    protection::{
        PropertyFilter, PropertyFilterEntityQueryPath, PropertyFilterExpression,
        PropertyFilterExpressionList, PropertyProtectionFilterConfig,
    },
};
use insta::{Settings, assert_snapshot};
use type_system::ontology::BaseUrl;

use super::{lower_filter, lower_property_filter, resolve_expression, resolve_path};
use crate::postgres::authorization::tests::{
    ACTOR_UUID, Fixture, policy_components, policy_components_admin,
};

fn base_url(url: &str) -> BaseUrl {
    BaseUrl::new(url.to_owned()).expect("valid base URL")
}

fn snapshot_settings() -> Settings {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(manifest_dir.join("tests/ui/postgres/authorization/protection"));
    settings.set_prepend_module_to_snapshot(false);
    settings
}

#[test]
fn resolve_path_uuid() {
    let mut fixture = Fixture::new();
    let expr = resolve_path(
        &mut fixture.protection(),
        PropertyFilterEntityQueryPath::Uuid,
    );

    let mut settings = snapshot_settings();
    settings.set_description(format!("{:?}", PropertyFilterEntityQueryPath::Uuid));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("resolve_path_uuid", expr.transpile_to_string());
}

#[test]
fn resolve_path_type_base_urls() {
    let mut fixture = Fixture::new();
    let expr = resolve_path(
        &mut fixture.protection(),
        PropertyFilterEntityQueryPath::TypeBaseUrls,
    );

    let mut settings = snapshot_settings();
    settings.set_description(format!("{:?}", PropertyFilterEntityQueryPath::TypeBaseUrls));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("resolve_path_type_base_urls", expr.transpile_to_string());
}

#[test]
fn resolve_expression_text_parameter() {
    let mut fixture = Fixture::new();
    let param = PropertyFilterExpression::Parameter {
        parameter: Parameter::Text(Cow::Borrowed("hello")),
    };
    let expr = resolve_expression(&mut fixture.protection(), &param);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{param:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("resolve_expression_text", expr.transpile_to_string());
}

#[test]
fn resolve_expression_actor_id() {
    let mut fixture = Fixture::new();
    let expr = resolve_expression(
        &mut fixture.protection(),
        &PropertyFilterExpression::ActorId,
    );

    let mut settings = snapshot_settings();
    settings.set_description(format!(
        "ActorId, actor = {:?}",
        fixture.protection().actor_id
    ));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("resolve_expression_actor_id", expr.transpile_to_string());
}

#[test]
fn lower_filter_equal() {
    let mut fixture = Fixture::new();
    let filter = PropertyFilter::Equal(
        PropertyFilterExpression::Path {
            path: PropertyFilterEntityQueryPath::Uuid,
        },
        PropertyFilterExpression::ActorId,
    );
    let expr = lower_filter(&mut fixture.protection(), &filter);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{filter:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("lower_filter_equal", expr.transpile_to_string());
}

#[test]
fn lower_filter_not_equal() {
    let mut fixture = Fixture::new();
    let filter = PropertyFilter::NotEqual(
        PropertyFilterExpression::Path {
            path: PropertyFilterEntityQueryPath::Uuid,
        },
        PropertyFilterExpression::ActorId,
    );
    let expr = lower_filter(&mut fixture.protection(), &filter);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{filter:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("lower_filter_not_equal", expr.transpile_to_string());
}

#[test]
fn lower_filter_in() {
    let mut fixture = Fixture::new();
    let filter = PropertyFilter::In(
        PropertyFilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed("https://hash.ai/@h/types/entity-type/user/")),
        },
        PropertyFilterExpressionList::Path {
            path: PropertyFilterEntityQueryPath::TypeBaseUrls,
        },
    );
    let expr = lower_filter(&mut fixture.protection(), &filter);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{filter:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("lower_filter_in", expr.transpile_to_string());
}

#[test]
fn lower_filter_nested_all_any() {
    let mut fixture = Fixture::new();
    let filter = PropertyFilter::All(vec![
        PropertyFilter::In(
            PropertyFilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(
                    "https://hash.ai/@h/types/entity-type/user/",
                )),
            },
            PropertyFilterExpressionList::Path {
                path: PropertyFilterEntityQueryPath::TypeBaseUrls,
            },
        ),
        PropertyFilter::NotEqual(
            PropertyFilterExpression::Path {
                path: PropertyFilterEntityQueryPath::Uuid,
            },
            PropertyFilterExpression::ActorId,
        ),
    ]);
    let expr = lower_filter(&mut fixture.protection(), &filter);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{filter:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("lower_filter_nested_all", expr.transpile_to_string());
}

#[test]
fn lower_property_filter_case_when() {
    let mut fixture = Fixture::new();
    let filter = PropertyFilter::Equal(
        PropertyFilterExpression::Path {
            path: PropertyFilterEntityQueryPath::Uuid,
        },
        PropertyFilterExpression::ActorId,
    );
    let url = base_url("https://hash.ai/@h/types/property-type/email/");
    let expr = lower_property_filter(&mut fixture.protection(), url, &filter);

    let mut settings = snapshot_settings();
    settings.set_description(format!("property: email/, filter: {filter:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "lower_property_filter_case_when",
        expr.transpile_to_string()
    );
}

#[test]
fn transpile_empty_config_returns_none() {
    let mut fixture = Fixture::new();
    let policy = policy_components(None, vec![]);
    let config = PropertyProtectionFilterConfig::new();
    let result = fixture.protection().transpile(&policy, &config);
    assert!(result.keys_to_remove.is_none());
}

#[test]
fn transpile_instance_admin_returns_none() {
    let mut fixture = Fixture::new();
    let actor = Some(type_system::principal::actor::ActorId::User(
        type_system::principal::actor::UserId::new(ACTOR_UUID),
    ));
    let policy = policy_components_admin(actor, vec![]);
    let mut config = PropertyProtectionFilterConfig::new();
    config.protect_property(
        base_url("https://hash.ai/@h/types/property-type/email/"),
        PropertyFilter::Equal(
            PropertyFilterExpression::Path {
                path: PropertyFilterEntityQueryPath::Uuid,
            },
            PropertyFilterExpression::ActorId,
        ),
    );
    let result = fixture.protection().transpile(&policy, &config);
    assert!(result.keys_to_remove.is_none());
}

#[test]
fn transpile_hash_default_config() {
    let mut fixture = Fixture::new();
    let actor = Some(type_system::principal::actor::ActorId::User(
        type_system::principal::actor::UserId::new(ACTOR_UUID),
    ));
    let policy = policy_components(actor, vec![]);
    let config = PropertyProtectionFilterConfig::hash_default();
    let result = fixture.protection().transpile(&policy, &config);
    let expr = result.keys_to_remove.expect("should produce a mask");

    let mut settings = snapshot_settings();
    settings.set_description(format!("{config:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("transpile_hash_default", expr.transpile_to_string());
}
