use alloc::alloc::Global;
use std::path::PathBuf;

use hash_graph_postgres_store::store::postgres::query::{
    FromItem, SelectStatement, SimpleSelect, Table, TableName, Transpile as _,
};
use insta::{Settings, assert_snapshot};

use super::{AuxiliaryProjections, Projections};
use crate::postgres::Parameters;

fn snapshot_settings() -> Settings {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(manifest_dir.join("tests/ui/postgres/authorization/projections"));
    settings.set_prepend_module_to_snapshot(false);
    settings
}

fn make_lateral(name: &'static str) -> FromItem<'static> {
    FromItem::Subquery {
        lateral: true,
        statement: Box::new(
            SelectStatement::builder()
                .select_clause(
                    SimpleSelect::builder()
                        .selects(vec![])
                        .from(
                            FromItem::table(Table::EntityTemporalMetadata)
                                .alias(TableName::from(name))
                                .build(),
                        )
                        .build(),
                )
                .build(),
        ),
        alias: Some(TableName::from(name)),
        column_aliases: Vec::new(),
    }
}

#[test]
fn build_from_base_only() {
    let projections = Projections::new();
    let mut parameters = Parameters::new_in(Global);
    let from = projections.build_from(&mut parameters, Vec::new());

    let mut settings = snapshot_settings();
    settings.set_description(format!("{projections:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!("build_from_base_only", from.transpile_to_string());
}

#[test]
fn build_from_with_entity_editions() {
    let mut projections = Projections::new();
    projections.entity_editions();
    let mut parameters = Parameters::new_in(Global);
    let from = projections.build_from(&mut parameters, Vec::new());

    let mut settings = snapshot_settings();
    settings.set_description(format!("{projections:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "build_from_with_entity_editions",
        from.transpile_to_string()
    );
}

#[test]
fn build_from_with_entity_ids_and_editions() {
    let mut projections = Projections::new();
    projections.entity_ids();
    projections.entity_editions();
    let mut parameters = Parameters::new_in(Global);
    let from = projections.build_from(&mut parameters, Vec::new());

    let mut settings = snapshot_settings();
    settings.set_description(format!("{projections:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "build_from_with_entity_ids_and_editions",
        from.transpile_to_string(),
    );
}

#[test]
fn build_from_editions_before_continuations() {
    let mut projections = Projections::new();
    projections.entity_editions();
    let mut parameters = Parameters::new_in(Global);

    let lateral = make_lateral("continuation_1");
    let from = projections.build_from(&mut parameters, vec![lateral]);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{projections:?}, 1 continuation lateral"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "build_from_editions_before_continuations",
        from.transpile_to_string(),
    );
}

#[test]
fn build_joins_no_laterals_no_auth() {
    let base = Projections::new();
    let aux = AuxiliaryProjections::new(&base);

    let from = FromItem::table(Table::EntityTemporalMetadata)
        .alias(Table::EntityTemporalMetadata.aliased_name(base.base_alias))
        .build();

    let result = aux.build_joins(from.clone());
    assert_eq!(
        result.transpile_to_string(),
        from.transpile_to_string(),
        "no auth joins requested means FROM is unchanged",
    );
}

#[test]
fn build_joins_inserts_before_laterals() {
    let base = Projections::new();
    let mut aux = AuxiliaryProjections::new(&base);
    aux.entity_edition_cache();

    let core = FromItem::table(Table::EntityTemporalMetadata)
        .alias(Table::EntityTemporalMetadata.aliased_name(base.base_alias))
        .build();

    let lateral_1 = make_lateral("continuation_1");
    let lateral_2 = make_lateral("continuation_2");
    let from = core.cross_join(lateral_1).cross_join(lateral_2);

    let result = aux.build_joins(from);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{aux:?}, 2 continuation laterals"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "build_joins_inserts_before_laterals",
        result.transpile_to_string(),
    );
}

#[test]
fn build_joins_no_laterals_with_auth() {
    let base = Projections::new();
    let mut aux = AuxiliaryProjections::new(&base);
    aux.entity_ids();
    aux.entity_edition_cache();

    let from = FromItem::table(Table::EntityTemporalMetadata)
        .alias(Table::EntityTemporalMetadata.aliased_name(base.base_alias))
        .build();

    let result = aux.build_joins(from);

    let mut settings = snapshot_settings();
    settings.set_description(format!("{aux:?}"));
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "build_joins_no_laterals_with_auth",
        result.transpile_to_string(),
    );
}
