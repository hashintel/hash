use alloc::borrow::Cow;
use core::str::FromStr as _;

use hash_codec::numeric::Real;
use hash_graph_store::{
    data_type::DataTypeQueryPath,
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    filter::{
        Filter, FilterExpression, JsonPath, Parameter, PathToken,
        protection::PropertyProtectionFilterConfig,
    },
    property_type::PropertyTypeQueryPath,
    query::{NullOrdering, Ordering},
    subgraph::{
        edges::{EdgeDirection, KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind},
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use hash_graph_types::Embedding;
use postgres_types::ToSql;
use type_system::{
    knowledge::Entity,
    ontology::{
        BaseUrl, DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata,
        VersionedUrl,
    },
};
use uuid::Uuid;

use crate::store::postgres::query::{
    Distinctness, PostgresRecord, SelectCompiler, SelectExpression, SelectStatement,
    Transpile as _, compile::SelectCompilerError, test_helper::trim_whitespace,
};

#[track_caller]
fn test_compilation<'p, 'q: 'p, T: PostgresRecord + 'static>(
    compiler: &SelectCompiler<'p, 'q, T>,
    expected_statement: &'static str,
    expected_parameters: &[&'p dyn ToSql],
) {
    let (compiled_statement, compiled_parameters) = compiler.compile();

    pretty_assertions::assert_eq!(
        trim_whitespace(expected_statement),
        trim_whitespace(&compiled_statement),
        "actual:\n{compiled_statement}\nexpected: {expected_statement}"
    );

    let compiled_parameters = compiled_parameters
        .iter()
        .map(|parameter| format!("{parameter:?}"))
        .collect::<Vec<_>>();
    let expected_parameters = expected_parameters
        .iter()
        .map(|parameter| format!("{parameter:?}"))
        .collect::<Vec<_>>();

    pretty_assertions::assert_eq!(compiled_parameters, expected_parameters);
}

#[test]
fn asterisk() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    test_compilation(
        &SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false),
        r#"SELECT * FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0""#,
        &[],
    );
}

#[test]
fn simple_expression() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler =
        SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);
    compiler
        .add_filter(&Filter::Equal(
            FilterExpression::Path {
                path: DataTypeQueryPath::VersionedUrl,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )),
                convert: None,
            },
        ))
        .expect("Failed to add filter");
    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        INNER JOIN "data_types" AS "data_types_0_1_0"
          ON "data_types_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "data_types_0_1_0"."schema"->>'$id' = $2
        "#,
        &[
            &pinned_timestamp,
            &"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        ],
    );
}

#[test]
fn limited_temporal() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);
    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::Uuid,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(Uuid::nil()),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");
    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND "entity_temporal_metadata_0_0_0"."entity_uuid" = $3
        "#,
        &[
            &temporal_axes.pinned_timestamp(),
            &temporal_axes.variable_interval(),
            &Uuid::nil(),
        ],
    );
}

#[test]
fn full_temporal() {
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(None, false);
    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::Uuid,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(Uuid::nil()),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");
    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."entity_uuid" = $1
        "#,
        &[&Uuid::nil()],
    );
}

#[test]
fn specific_version() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler =
        SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::All(vec![
        Filter::Equal(
            FilterExpression::Path {
                path: DataTypeQueryPath::BaseUrl,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                )),
                convert: None,
            },
        ),
        Filter::Equal(
            FilterExpression::Path {
                path: DataTypeQueryPath::Version,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Decimal(Real::from_natural(1, 1)),
                convert: None,
            },
        ),
    ]);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        INNER JOIN "ontology_ids" AS "ontology_ids_0_1_0"
          ON "ontology_ids_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND ("ontology_ids_0_1_0"."base_url" = $2) AND ("ontology_ids_0_1_0"."version" = $3)
        "#,
        &[
            &pinned_timestamp,
            &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
            &Real::from_natural(1, 1),
        ],
    );
}

#[test]
fn latest_version() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler =
        SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

    compiler
        .add_filter(&Filter::Equal(
            FilterExpression::Path {
                path: DataTypeQueryPath::Version,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed("latest")),
                convert: None,
            },
        ))
        .expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        WITH "ontology_ids" AS (SELECT *, MAX("ontology_ids_0_0_0"."version") OVER (PARTITION BY "ontology_ids_0_0_0"."base_url") AS "latest_version" FROM "ontology_ids" AS "ontology_ids_0_0_0")
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        INNER JOIN "ontology_ids" AS "ontology_ids_0_1_0"
          ON "ontology_ids_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version"
        "#,
        &[&pinned_timestamp],
    );
}

#[test]
fn not_latest_version() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler =
        SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

    compiler
        .add_filter(&Filter::NotEqual(
            FilterExpression::Path {
                path: DataTypeQueryPath::Version,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed("latest")),
                convert: None,
            },
        ))
        .expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        WITH "ontology_ids" AS (SELECT *, MAX("ontology_ids_0_0_0"."version") OVER (PARTITION BY "ontology_ids_0_0_0"."base_url") AS "latest_version" FROM "ontology_ids" AS "ontology_ids_0_0_0")
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        INNER JOIN "ontology_ids" AS "ontology_ids_0_1_0"
          ON "ontology_ids_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "ontology_ids_0_1_0"."version" != "ontology_ids_0_1_0"."latest_version"
        "#,
        &[&pinned_timestamp],
    );
}

#[test]
fn property_type_by_referenced_data_types() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler =
        SelectCompiler::<PropertyTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

    compiler
        .add_filter(&Filter::Equal(
            FilterExpression::Path {
                path: PropertyTypeQueryPath::DataTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                    path: DataTypeQueryPath::Title,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed("Text")),
                convert: None,
            },
        ))
        .expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "property_type_constrains_values_on" AS "property_type_constrains_values_on_0_1_0"
          ON "property_type_constrains_values_on_0_1_0"."source_property_type_ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_2_0"
          ON "ontology_temporal_metadata_0_2_0"."ontology_id" = "property_type_constrains_values_on_0_1_0"."target_data_type_ontology_id"
         AND "ontology_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "data_types" AS "data_types_0_3_0"
         ON "data_types_0_3_0"."ontology_id" = "ontology_temporal_metadata_0_2_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "data_types_0_3_0"."schema"->>'title' = $2
        "#,
        &[&pinned_timestamp, &"Text"],
    );

    let filter = Filter::All(vec![
        Filter::Equal(
            FilterExpression::Path {
                path: PropertyTypeQueryPath::DataTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                    path: DataTypeQueryPath::BaseUrl,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                )),
                convert: None,
            },
        ),
        Filter::Equal(
            FilterExpression::Path {
                path: PropertyTypeQueryPath::DataTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                    path: DataTypeQueryPath::Version,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Decimal(Real::from_natural(1, 1)),
                convert: None,
            },
        ),
    ]);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "property_type_constrains_values_on" AS "property_type_constrains_values_on_0_1_0"
          ON "property_type_constrains_values_on_0_1_0"."source_property_type_ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_2_0"
          ON "ontology_temporal_metadata_0_2_0"."ontology_id" = "property_type_constrains_values_on_0_1_0"."target_data_type_ontology_id"
         AND "ontology_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "data_types" AS "data_types_0_3_0"
          ON "data_types_0_3_0"."ontology_id" = "ontology_temporal_metadata_0_2_0"."ontology_id"
        LEFT OUTER JOIN "property_type_constrains_values_on" AS "property_type_constrains_values_on_1_1_0"
          ON "property_type_constrains_values_on_1_1_0"."source_property_type_ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_1_2_0"
          ON "ontology_temporal_metadata_1_2_0"."ontology_id" = "property_type_constrains_values_on_1_1_0"."target_data_type_ontology_id"
         AND "ontology_temporal_metadata_1_2_0"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "ontology_ids" AS "ontology_ids_1_3_0"
          ON "ontology_ids_1_3_0"."ontology_id" = "ontology_temporal_metadata_1_2_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "data_types_0_3_0"."schema"->>'title' = $2
          AND ("ontology_ids_1_3_0"."base_url" = $3) AND ("ontology_ids_1_3_0"."version" = $4)
        "#,
        &[
            &pinned_timestamp,
            &"Text",
            &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
            &Real::from_natural(1, 1),
        ],
    );
}

#[test]
fn property_type_by_referenced_property_types() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler =
        SelectCompiler::<PropertyTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::Equal(
        FilterExpression::Path {
            path: PropertyTypeQueryPath::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path: Box::new(PropertyTypeQueryPath::Title),
                direction: EdgeDirection::Outgoing,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed("Text")),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "property_type_constrains_properties_on" AS "property_type_constrains_properties_on_0_1_0"
          ON "property_type_constrains_properties_on_0_1_0"."source_property_type_ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_2_0"
          ON "ontology_temporal_metadata_0_2_0"."ontology_id" = "property_type_constrains_properties_on_0_1_0"."target_property_type_ontology_id"
         AND "ontology_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "property_types" AS "property_types_0_3_0"
          ON "property_types_0_3_0"."ontology_id" = "ontology_temporal_metadata_0_2_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "property_types_0_3_0"."schema"->>'title' = $2
        "#,
        &[&pinned_timestamp, &"Text"],
    );
}

#[test]
fn entity_type_by_referenced_property_types() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler =
        SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityTypeQueryPath::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path: PropertyTypeQueryPath::Title,
                inheritance_depth: Some(0),
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed("Name")),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "entity_type_constrains_properties_on" AS "entity_type_constrains_properties_on_0_1_0"
          ON "entity_type_constrains_properties_on_0_1_0"."source_entity_type_ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
         AND "entity_type_constrains_properties_on_0_1_0"."inheritance_depth" <= 0
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_2_0"
          ON "ontology_temporal_metadata_0_2_0"."ontology_id" = "entity_type_constrains_properties_on_0_1_0"."target_property_type_ontology_id"
         AND "ontology_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "property_types" AS "property_types_0_3_0"
          ON "property_types_0_3_0"."ontology_id" = "ontology_temporal_metadata_0_2_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "property_types_0_3_0"."schema"->>'title' = $2
        "#,
        &[&pinned_timestamp, &"Name"],
    );
}

#[test]
fn entity_type_by_referenced_link_types() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler =
        SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityTypeQueryPath::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                path: Box::new(EntityTypeQueryPath::EntityTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                    path: Box::new(EntityTypeQueryPath::Title),
                    direction: EdgeDirection::Outgoing,
                    inheritance_depth: Some(0),
                }),
                direction: EdgeDirection::Outgoing,
                inheritance_depth: Some(0),
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed("Friend Of")),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "ontology_temporal_metadata"
          AS "ontology_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "entity_type_constrains_links_on" AS "entity_type_constrains_links_on_0_1_0"
          ON "entity_type_constrains_links_on_0_1_0"."source_entity_type_ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
         AND "entity_type_constrains_links_on_0_1_0"."inheritance_depth" <= 0
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_2_0"
          ON "ontology_temporal_metadata_0_2_0"."ontology_id" = "entity_type_constrains_links_on_0_1_0"."target_entity_type_ontology_id"
         AND "ontology_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "entity_type_constrains_links_on" AS "entity_type_constrains_links_on_0_3_0"
          ON "entity_type_constrains_links_on_0_3_0"."source_entity_type_ontology_id" = "ontology_temporal_metadata_0_2_0"."ontology_id"
         AND "entity_type_constrains_links_on_0_3_0"."inheritance_depth" <= 0
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_4_0"
          ON "ontology_temporal_metadata_0_4_0"."ontology_id" = "entity_type_constrains_links_on_0_3_0"."target_entity_type_ontology_id"
         AND "ontology_temporal_metadata_0_4_0"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "entity_types" AS "entity_types_0_5_0"
          ON "entity_types_0_5_0"."ontology_id" = "ontology_temporal_metadata_0_4_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_types_0_5_0"."schema"->>'title' = $2
        "#,
        &[&pinned_timestamp, &"Friend Of"],
    );
}

#[test]
fn entity_type_by_inheritance() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler =
        SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityTypeQueryPath::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::InheritsFrom,
                path: Box::new(EntityTypeQueryPath::BaseUrl),
                direction: EdgeDirection::Outgoing,
                inheritance_depth: Some(0),
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed(
                "https://blockprotocol.org/@blockprotocol/types/entity-type/link/",
            )),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "entity_type_inherits_from" AS "entity_type_inherits_from_0_1_0"
          ON "entity_type_inherits_from_0_1_0"."source_entity_type_ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
         AND "entity_type_inherits_from_0_1_0"."depth" <= 0
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_2_0"
          ON "ontology_temporal_metadata_0_2_0"."ontology_id" = "entity_type_inherits_from_0_1_0"."target_entity_type_ontology_id"
         AND "ontology_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "ontology_ids" AS "ontology_ids_0_3_0"
          ON "ontology_ids_0_3_0"."ontology_id" = "ontology_temporal_metadata_0_2_0"."ontology_id"
        WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "ontology_ids_0_3_0"."base_url" = $2
        "#,
        &[
            &pinned_timestamp,
            &"https://blockprotocol.org/@blockprotocol/types/entity-type/link/",
        ],
    );
}

#[test]
fn entity_simple_query() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::Uuid,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed("12345678-ABCD-4321-5678-ABCD5555DCBA")),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND "entity_temporal_metadata_0_0_0"."entity_uuid" = $3
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"12345678-ABCD-4321-5678-ABCD5555DCBA",
        ],
    );
}

#[test]
fn filter_entity_by_created_by_id() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let actor_uuid = Uuid::nil();
    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::CreatedById,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(actor_uuid),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_ids" AS "entity_ids_0_1_0"
          ON "entity_ids_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_ids_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND "entity_ids_0_1_0"."created_by_id" = $3
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &actor_uuid,
        ],
    );
}

#[test]
fn sort_entity_by_created_at_transaction_time() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::CreatedAtTransactionTime,
        Distinctness::Distinct,
        Some((Ordering::Descending, Some(NullOrdering::First))),
    );

    test_compilation(
        &compiler,
        r#"
        SELECT
            DISTINCT ON("entity_ids_0_1_0"."created_at_transaction_time")
            "entity_ids_0_1_0"."created_at_transaction_time"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_ids" AS "entity_ids_0_1_0"
          ON "entity_ids_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_ids_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
        ORDER BY "entity_ids_0_1_0"."created_at_transaction_time" DESC NULLS FIRST
        "#,
        &[&pinned_timestamp, &temporal_axes.variable_interval()],
    );
}

#[test]
fn entity_with_manual_selection() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::DecisionTime,
        Distinctness::Distinct,
        Some((Ordering::Descending, Some(NullOrdering::Last))),
    );
    compiler.add_selection_path(&EntityQueryPath::Properties(None));

    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::DraftId,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(Uuid::nil()),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT
            DISTINCT ON("entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."decision_time")
            "entity_temporal_metadata_0_0_0"."entity_uuid",
            "entity_temporal_metadata_0_0_0"."decision_time",
            "entity_editions_0_1_0"."properties"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
          ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND "entity_temporal_metadata_0_0_0"."draft_id" = $3
        ORDER BY "entity_temporal_metadata_0_0_0"."entity_uuid" ASC,
                 "entity_temporal_metadata_0_0_0"."decision_time" DESC NULLS LAST
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &Uuid::nil(),
        ],
    );
}

#[test]
fn entity_property_query() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);
    let json_path = JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Borrowed(
        r#"$."https://blockprotocol.org/@alice/types/property-type/name/""#,
    ))]);

    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::Properties(Some(json_path.clone())),
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed("Bob")),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
          ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $2::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $3
          AND jsonb_path_query_first("entity_editions_0_1_0"."properties", (($1::text)::jsonpath)) = $4
        "#,
        &[
            &json_path,
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"Bob",
        ],
    );
}

#[test]
fn entity_property_null_query() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);
    let json_path = JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Borrowed(
        r#"$."https://blockprotocol.org/@alice/types/property-type/name/""#,
    ))]);

    let filter = Filter::Exists {
        path: EntityQueryPath::Properties(Some(json_path.clone())),
    };
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
          ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $2::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $3
          AND jsonb_path_query_first("entity_editions_0_1_0"."properties", (($1::text)::jsonpath)) IS NOT NULL
        "#,
        &[
            &json_path,
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
        ],
    );
}

#[test]
fn entity_outgoing_link_query() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                    path: Box::new(EntityQueryPath::EditionId),
                    direction: EdgeDirection::Outgoing,
                }),
                direction: EdgeDirection::Incoming,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Decimal(Real::from_natural(10, 1)),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_1_0"
          ON "entity_has_left_entity_0_1_0"."left_web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_has_left_entity_0_1_0"."left_entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
          ON "entity_temporal_metadata_0_2_0"."web_id" = "entity_has_left_entity_0_1_0"."web_id"
         AND "entity_temporal_metadata_0_2_0"."entity_uuid" = "entity_has_left_entity_0_1_0"."entity_uuid"
         AND "entity_temporal_metadata_0_2_0"."draft_id" IS NULL
         AND "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
         AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
        LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_3_0"
          ON "entity_has_right_entity_0_3_0"."web_id" = "entity_temporal_metadata_0_2_0"."web_id"
         AND "entity_has_right_entity_0_3_0"."entity_uuid" = "entity_temporal_metadata_0_2_0"."entity_uuid"
        LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_4_0"
          ON "entity_temporal_metadata_0_4_0"."web_id" = "entity_has_right_entity_0_3_0"."right_web_id"
         AND "entity_temporal_metadata_0_4_0"."entity_uuid" = "entity_has_right_entity_0_3_0"."right_entity_uuid"
         AND "entity_temporal_metadata_0_4_0"."draft_id" IS NULL
         AND "entity_temporal_metadata_0_4_0"."transaction_time" @> $1::TIMESTAMPTZ
         AND "entity_temporal_metadata_0_4_0"."decision_time" && $2
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND "entity_temporal_metadata_0_4_0"."entity_edition_id" = $3
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &Real::from_natural(10, 1),
        ],
    );
}

#[test]
fn has_to_many_join_flag() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();

    // A type-URL filter resolves to the edition cache (to-one join) — no fan-out.
    let mut to_one = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);
    let to_one_filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::VersionedUrl,
                inheritance_depth: None,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed("https://example.com/v/1")),
            convert: None,
        },
    );
    to_one
        .add_filter(&to_one_filter)
        .expect("Failed to add filter");
    assert!(
        !to_one.has_to_many_join(),
        "type-URL filter hits the edition cache (to-one) and must not require dedup"
    );

    // An incoming link traversal fans out — must require dedup.
    let mut to_many = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);
    let to_many_filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::EditionId),
                direction: EdgeDirection::Incoming,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(Uuid::nil()),
            convert: None,
        },
    );
    to_many
        .add_filter(&to_many_filter)
        .expect("Failed to add filter");
    assert!(
        to_many.has_to_many_join(),
        "incoming link traversal fans out and must require dedup"
    );
}

#[test]
fn entity_incoming_link_query() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::EditionId),
                    direction: EdgeDirection::Outgoing,
                }),
                direction: EdgeDirection::Incoming,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Decimal(Real::from_natural(10, 1)),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
          ON "entity_has_right_entity_0_1_0"."right_web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_has_right_entity_0_1_0"."right_entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
          ON "entity_temporal_metadata_0_2_0"."web_id" = "entity_has_right_entity_0_1_0"."web_id"
         AND "entity_temporal_metadata_0_2_0"."entity_uuid" = "entity_has_right_entity_0_1_0"."entity_uuid"
         AND "entity_temporal_metadata_0_2_0"."draft_id" IS NULL
         AND "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
         AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
        LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_3_0"
          ON "entity_has_left_entity_0_3_0"."web_id" = "entity_temporal_metadata_0_2_0"."web_id"
         AND "entity_has_left_entity_0_3_0"."entity_uuid" = "entity_temporal_metadata_0_2_0"."entity_uuid"
        LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_4_0"
          ON "entity_temporal_metadata_0_4_0"."web_id" = "entity_has_left_entity_0_3_0"."left_web_id"
         AND "entity_temporal_metadata_0_4_0"."entity_uuid" = "entity_has_left_entity_0_3_0"."left_entity_uuid"
         AND "entity_temporal_metadata_0_4_0"."draft_id" IS NULL
         AND "entity_temporal_metadata_0_4_0"."transaction_time" @> $1::TIMESTAMPTZ
         AND "entity_temporal_metadata_0_4_0"."decision_time" && $2
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND "entity_temporal_metadata_0_4_0"."entity_edition_id" = $3
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &Real::from_natural(10, 1),
        ],
    );
}

#[test]
fn link_entity_left_right_id() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::All(vec![
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::Uuid),
                    direction: EdgeDirection::Outgoing,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(Uuid::nil()),
                convert: None,
            },
        ),
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::WebId),
                    direction: EdgeDirection::Outgoing,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(Uuid::nil()),
                convert: None,
            },
        ),
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                    path: Box::new(EntityQueryPath::Uuid),
                    direction: EdgeDirection::Outgoing,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(Uuid::nil()),
                convert: None,
            },
        ),
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                    path: Box::new(EntityQueryPath::WebId),
                    direction: EdgeDirection::Outgoing,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(Uuid::nil()),
                convert: None,
            },
        ),
    ]);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_1_0"
          ON "entity_has_left_entity_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_has_left_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
          ON "entity_has_right_entity_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_has_right_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND ("entity_has_left_entity_0_1_0"."left_entity_uuid" = $3)
          AND ("entity_has_left_entity_0_1_0"."left_web_id" = $4)
          AND ("entity_has_right_entity_0_1_0"."right_entity_uuid" = $5)
          AND ("entity_has_right_entity_0_1_0"."right_web_id" = $6)
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &Uuid::nil(),
            &Uuid::nil(),
            &Uuid::nil(),
            &Uuid::nil(),
        ],
    );
}

#[test]
#[expect(clippy::similar_names)]
fn two_linked_entities() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();

    let entity_a_uuid = Uuid::new_v4();
    let entity_b_uuid = Uuid::new_v4();

    let filter_a = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(EntityQueryPath::Uuid),
                direction: EdgeDirection::Outgoing,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(entity_a_uuid),
            convert: None,
        },
    );

    let filter_b = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(EntityQueryPath::Uuid),
                direction: EdgeDirection::Outgoing,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(entity_b_uuid),
            convert: None,
        },
    );

    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);
    compiler
        .add_filter(&filter_a)
        .expect("Failed to add filter");
    compiler
        .add_filter(&filter_b)
        .expect("Failed to add filter");

    // For each filter, we have a dedicated join
    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
          ON "entity_has_right_entity_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_has_right_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_1_1_0"
          ON "entity_has_right_entity_1_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_has_right_entity_1_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND "entity_has_right_entity_0_1_0"."right_entity_uuid" = $3
          AND "entity_has_right_entity_1_1_0"."right_entity_uuid" = $4
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &entity_a_uuid,
            &entity_b_uuid,
        ],
    );

    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);
    let combined_filter = Filter::All(vec![filter_a.clone(), filter_b.clone()]);
    compiler
        .add_filter(&combined_filter)
        .expect("Failed to add filter");

    // A combined filter re-uses the same join
    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
          ON "entity_has_right_entity_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_has_right_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND ("entity_has_right_entity_0_1_0"."right_entity_uuid" = $3)
          AND ("entity_has_right_entity_0_1_0"."right_entity_uuid" = $4)
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &entity_a_uuid,
            &entity_b_uuid,
        ],
    );
}

#[test]
fn filter_left_and_right() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::All(vec![
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::BaseUrl,
                        inheritance_depth: Some(0),
                    }),
                    direction: EdgeDirection::Outgoing,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(
                    "https://example.com/@example-org/types/entity-type/address",
                )),
                convert: None,
            },
        ),
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                    path: Box::new(EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::BaseUrl,
                        inheritance_depth: Some(0),
                    }),
                    direction: EdgeDirection::Outgoing,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(
                    "https://example.com/@example-org/types/entity-type/name",
                )),
                convert: None,
            },
        ),
    ]);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_1_0"
          ON "entity_has_left_entity_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_has_left_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
          ON "entity_temporal_metadata_0_2_0"."web_id" = "entity_has_left_entity_0_1_0"."left_web_id"
         AND "entity_temporal_metadata_0_2_0"."entity_uuid" = "entity_has_left_entity_0_1_0"."left_entity_uuid"
         AND "entity_temporal_metadata_0_2_0"."draft_id" IS NULL
         AND "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
         AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
        LEFT OUTER JOIN "entity_is_of_type" AS "entity_is_of_type_0_3_0"
          ON "entity_is_of_type_0_3_0"."entity_edition_id" = "entity_temporal_metadata_0_2_0"."entity_edition_id"
         AND "entity_is_of_type_0_3_0"."inheritance_depth" <= 0
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_4_0"
          ON "ontology_temporal_metadata_0_4_0"."ontology_id" = "entity_is_of_type_0_3_0"."entity_type_ontology_id"
         AND "ontology_temporal_metadata_0_4_0"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "ontology_ids" AS "ontology_ids_0_5_0"
          ON "ontology_ids_0_5_0"."ontology_id" = "ontology_temporal_metadata_0_4_0"."ontology_id"
        LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
          ON "entity_has_right_entity_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_has_right_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_1"
          ON "entity_temporal_metadata_0_2_1"."web_id" = "entity_has_right_entity_0_1_0"."right_web_id"
         AND "entity_temporal_metadata_0_2_1"."entity_uuid" = "entity_has_right_entity_0_1_0"."right_entity_uuid"
         AND "entity_temporal_metadata_0_2_1"."draft_id" IS NULL
         AND "entity_temporal_metadata_0_2_1"."transaction_time" @> $1::TIMESTAMPTZ
         AND "entity_temporal_metadata_0_2_1"."decision_time" && $2
        LEFT OUTER JOIN "entity_is_of_type" AS "entity_is_of_type_0_3_1"
          ON "entity_is_of_type_0_3_1"."entity_edition_id" = "entity_temporal_metadata_0_2_1"."entity_edition_id"
         AND "entity_is_of_type_0_3_1"."inheritance_depth" <= 0
        LEFT OUTER JOIN "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_4_1"
          ON "ontology_temporal_metadata_0_4_1"."ontology_id" = "entity_is_of_type_0_3_1"."entity_type_ontology_id"
         AND "ontology_temporal_metadata_0_4_1"."transaction_time" @> $1::TIMESTAMPTZ
        LEFT OUTER JOIN "ontology_ids" AS "ontology_ids_0_5_1"
          ON "ontology_ids_0_5_1"."ontology_id" = "ontology_temporal_metadata_0_4_1"."ontology_id"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND ("ontology_ids_0_5_0"."base_url" = $3)
          AND ("ontology_ids_0_5_1"."base_url" = $4)
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"https://example.com/@example-org/types/entity-type/address",
            &"https://example.com/@example-org/types/entity-type/name",
        ],
    );
}

#[test]
fn filter_entity_by_type_versioned_url() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let url =
        VersionedUrl::from_str("https://example.com/@example-org/types/entity-type/address/v/1")
            .expect("should parse versioned url");
    let filter = Filter::for_entity_by_type_id(&url);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
              ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
            WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
              AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
              AND "entity_edition_cache_0_1_0"."versioned_urls" @> ARRAY[$3]::text[]
            "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"https://example.com/@example-org/types/entity-type/address/v/1",
        ],
    );
}

#[test]
fn filter_entity_by_any_type_versioned_url() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let url_a =
        VersionedUrl::from_str("https://example.com/@example-org/types/entity-type/address/v/1")
            .expect("should parse versioned url");
    let url_b =
        VersionedUrl::from_str("https://example.com/@example-org/types/entity-type/location/v/1")
            .expect("should parse versioned url");
    let filter = Filter::Any(vec![
        Filter::for_entity_by_type_id(&url_a),
        Filter::for_entity_by_type_id(&url_b),
    ]);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
                ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
            WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
                AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                AND ("entity_edition_cache_0_1_0"."versioned_urls" && ARRAY[$3, $4]::text[])
            "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"https://example.com/@example-org/types/entity-type/address/v/1",
            &"https://example.com/@example-org/types/entity-type/location/v/1",
        ],
    );
}

#[test]
fn filter_entity_by_all_type_versioned_url() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let url_a =
        VersionedUrl::from_str("https://example.com/@example-org/types/entity-type/address/v/1")
            .expect("should parse versioned url");
    let url_b =
        VersionedUrl::from_str("https://example.com/@example-org/types/entity-type/location/v/1")
            .expect("should parse versioned url");
    let filter = Filter::All(vec![
        Filter::for_entity_by_type_id(&url_a),
        Filter::for_entity_by_type_id(&url_b),
    ]);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
                ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
            WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
                AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                AND ("entity_edition_cache_0_1_0"."versioned_urls" @> ARRAY[$3, $4]::text[])
            "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"https://example.com/@example-org/types/entity-type/address/v/1",
            &"https://example.com/@example-org/types/entity-type/location/v/1",
        ],
    );
}

#[test]
fn filter_entity_own_and_linked_type_stay_separate() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    // Both paths terminate in `entity_edition_cache.versioned_urls`, but through
    // different join chains — bundling them would test the linked entity's type
    // against the entity's own type array.
    let filter = Filter::All(vec![
        Filter::<Entity>::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityTypeEdge {
                    edge_kind: SharedEdgeKind::IsOfType,
                    path: EntityTypeQueryPath::VersionedUrl,
                    inheritance_depth: None,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(
                    "https://example.com/@example-org/types/entity-type/page/v/1",
                )),
                convert: None,
            },
        ),
        Filter::<Entity>::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                    path: Box::new(EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::VersionedUrl,
                        inheritance_depth: None,
                    }),
                    direction: EdgeDirection::Outgoing,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(
                    "https://example.com/@example-org/types/entity-type/user/v/1",
                )),
                convert: None,
            },
        ),
    ]);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
                ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
            LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
                ON "entity_has_right_entity_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
               AND "entity_has_right_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
            LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
                ON "entity_temporal_metadata_0_2_0"."web_id" = "entity_has_right_entity_0_1_0"."right_web_id"
               AND "entity_temporal_metadata_0_2_0"."entity_uuid" = "entity_has_right_entity_0_1_0"."right_entity_uuid"
               AND "entity_temporal_metadata_0_2_0"."draft_id" IS NULL
               AND "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
               AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
            LEFT OUTER JOIN "entity_edition_cache" AS "entity_edition_cache_0_3_0"
                ON "entity_edition_cache_0_3_0"."entity_edition_id" = "entity_temporal_metadata_0_2_0"."entity_edition_id"
            WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
                AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                AND ("entity_edition_cache_0_1_0"."versioned_urls" @> ARRAY[$3]::text[])
                AND ("entity_edition_cache_0_3_0"."versioned_urls" @> ARRAY[$4]::text[])
            "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"https://example.com/@example-org/types/entity-type/page/v/1",
            &"https://example.com/@example-org/types/entity-type/user/v/1",
        ],
    );
}

#[test]
fn filter_entity_by_no_type_versioned_url() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let exclusion = |url: &'static str| {
        Filter::<Entity>::NotEqual(
            FilterExpression::Path {
                path: EntityQueryPath::EntityTypeEdge {
                    edge_kind: SharedEdgeKind::IsOfType,
                    path: EntityTypeQueryPath::VersionedUrl,
                    inheritance_depth: None,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(url)),
                convert: None,
            },
        )
    };
    let filter = Filter::All(vec![
        exclusion("https://example.com/@example-org/types/entity-type/address/v/1"),
        exclusion("https://example.com/@example-org/types/entity-type/location/v/1"),
    ]);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
                ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
            WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
                AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                AND (NOT("entity_edition_cache_0_1_0"."versioned_urls" && ARRAY[$3, $4]::text[]))
            "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"https://example.com/@example-org/types/entity-type/address/v/1",
            &"https://example.com/@example-org/types/entity-type/location/v/1",
        ],
    );
}

#[test]
fn filter_entity_by_type_starts_with_rejected() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    // String operations have no scalar to operate on once the path resolves to the
    // materialized `base_urls` array, so they must be rejected at compile time rather
    // than emit invalid SQL.
    let filter = Filter::<Entity>::StartsWith(
        FilterExpression::Path {
            path: EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::BaseUrl,
                inheritance_depth: None,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed(
                "https://example.com/@example-org/types/entity-type/",
            )),
            convert: None,
        },
    );

    let error = compiler
        .add_filter(&filter)
        .expect_err("string operation on a cached array path should be rejected");
    assert!(
        matches!(
            error.current_context(),
            SelectCompilerError::UnsupportedTextArrayOperation
        ),
        "unexpected error: {error:?}"
    );
}

#[test]
fn filter_entity_by_type_versioned_url_not_equal() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let filter = Filter::<Entity>::NotEqual(
        FilterExpression::Path {
            path: EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::VersionedUrl,
                inheritance_depth: None,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed(
                "https://example.com/@example-org/types/entity-type/address/v/1",
            )),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
          ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND NOT("entity_edition_cache_0_1_0"."versioned_urls" @> ARRAY[$3]::text[])
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"https://example.com/@example-org/types/entity-type/address/v/1",
        ],
    );
}

#[test]
fn filter_entity_by_type_base_url() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let base_url =
        BaseUrl::new("https://example.com/@example-org/types/entity-type/address/".to_owned())
            .expect("should parse base url");
    let filter = Filter::for_entity_by_base_type_id(&base_url);
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
          ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
          AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
          AND "entity_edition_cache_0_1_0"."base_urls" @> ARRAY[$3]::text[]
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"https://example.com/@example-org/types/entity-type/address/",
        ],
    );
}

#[test]
fn filter_embedding_distance() {
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(None, false);

    let filter = Filter::CosineDistance(
        FilterExpression::Path {
            path: EntityQueryPath::Embedding,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Vector(Embedding::from(vec![0.0; 1536])),
            convert: None,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Decimal(Real::from_natural(5, -1)),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");

    test_compilation(
        &compiler,
        r#"
          SELECT DISTINCT ON("entity_embeddings_0_1_0"."distance")
            *,
            "entity_embeddings_0_1_0"."distance"
          FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
          LEFT OUTER JOIN (SELECT
                "entity_embeddings"."web_id",
                "entity_embeddings"."entity_uuid",
                MIN("entity_embeddings"."embedding" <=> $1) AS "distance"
              FROM "entity_embeddings"
              GROUP BY "entity_embeddings"."web_id", "entity_embeddings"."entity_uuid")
             AS "entity_embeddings_0_1_0"
             ON "entity_embeddings_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
            AND "entity_embeddings_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
          WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
            AND "entity_embeddings_0_1_0"."distance" <= $2
          ORDER BY "entity_embeddings_0_1_0"."distance" ASC
        "#,
        &[
            &Embedding::from(vec![0.0; 1536]),
            &Real::from_natural(5, -1),
        ],
    );
}

#[test]
fn sort_by_label_and_type_title() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::FirstLabel,
        Distinctness::Distinct,
        Some((Ordering::Ascending, Some(NullOrdering::Last))),
    );
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::FirstTypeTitle,
        Distinctness::Distinct,
        Some((Ordering::Descending, Some(NullOrdering::Last))),
    );

    test_compilation(
        &compiler,
        r#"
        SELECT
            DISTINCT ON(("entity_edition_cache_0_1_0"."labels")[1], ("entity_edition_cache_0_1_0"."type_titles")[1])
            ("entity_edition_cache_0_1_0"."labels")[1],
            ("entity_edition_cache_0_1_0"."type_titles")[1]
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
          ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
          AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
        ORDER BY ("entity_edition_cache_0_1_0"."labels")[1] ASC NULLS LAST,
                 ("entity_edition_cache_0_1_0"."type_titles")[1] DESC NULLS LAST
        "#,
        &[&pinned_timestamp, &temporal_axes.variable_interval()],
    );
}

#[test]
fn transpile_offset() {
    let statement = SelectStatement::builder()
        .selects(vec![SelectExpression::Asterisk(None)])
        .limit(10)
        .offset(20)
        .build();

    assert_eq!(
        trim_whitespace(&statement.transpile_to_string()),
        "SELECT * LIMIT 10 OFFSET 20"
    );
}

mod predefined {
    use type_system::{
        knowledge::entity::id::{EntityId, EntityUuid},
        ontology::id::{BaseUrl, OntologyTypeVersion, VersionedUrl},
        principal::actor_group::WebId,
    };

    use super::*;

    #[test]
    fn for_versioned_url() {
        let url = VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
            )
            .expect("invalid base url"),
            version: OntologyTypeVersion {
                major: 1,
                pre_release: None,
            },
        };

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler =
            SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

        let filter = Filter::for_versioned_url(&url);
        compiler.add_filter(&filter).expect("Failed to add filter");

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
            INNER JOIN "ontology_ids" AS "ontology_ids_0_1_0"
              ON "ontology_ids_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
            WHERE "ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND ("ontology_ids_0_1_0"."base_url" = $2) AND ("ontology_ids_0_1_0"."version" = $3)
            "#,
            &[&pinned_timestamp, &url.base_url, &url.version],
        );
    }

    #[test]
    fn for_entity_by_entity_id() {
        let entity_id = EntityId {
            web_id: WebId::new(Uuid::new_v4()),
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: None,
        };

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

        let filter = Filter::for_entity_by_entity_id(entity_id);
        compiler.add_filter(&filter).expect("Failed to add filter");

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
              AND "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
              AND ("entity_temporal_metadata_0_0_0"."web_id" = $3)
              AND ("entity_temporal_metadata_0_0_0"."entity_uuid" = $4)
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &Uuid::from(entity_id.web_id),
                &Uuid::from(entity_id.entity_uuid),
            ],
        );
    }
}

mod property_masking {
    use super::*;

    #[test]
    fn single_property_masking() {
        let config = PropertyProtectionFilterConfig::hash_default();

        let mut compiler = SelectCompiler::<Entity>::new(None, false);

        // with_property_masking automatically adds the entity_edition_cache join
        let property_filter = config.to_property_protection_filter(None);
        compiler.with_property_masking(&property_filter);

        let _: usize = compiler.add_selection_path(&EntityQueryPath::Properties(None));

        test_compilation(
            &compiler,
            r#"
            SELECT ("entity_editions_0_1_0"."properties" - (CASE WHEN
                ("entity_temporal_metadata_0_0_0"."entity_uuid" != $1)
                AND ("entity_edition_cache_0_1_0"."base_urls" @> ARRAY[$2]::text[])
                THEN ARRAY[$3]::text[]
                ELSE ARRAY[]::text[] END))
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
                ON "entity_editions_0_1_0"."entity_edition_id" =
                    "entity_temporal_metadata_0_0_0"."entity_edition_id"
            INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
                ON "entity_edition_cache_0_1_0"."entity_edition_id" =
                    "entity_temporal_metadata_0_0_0"."entity_edition_id"
            WHERE "entity_temporal_metadata_0_0_0"."draft_id" IS NULL
            "#,
            &[
                &Uuid::nil(),
                &"https://hash.ai/@h/types/entity-type/user/",
                &"https://hash.ai/@h/types/property-type/email/",
            ],
        );
    }

    #[test]
    fn multiple_property_masking_with_array_concat() {
        let mut config = PropertyProtectionFilterConfig::hash_default();
        // Add second protected property using the same filter as email
        let phone_url = BaseUrl::new("https://hash.ai/@h/types/property-type/phone/".to_owned())
            .expect("valid URL");
        let email_url = BaseUrl::new("https://hash.ai/@h/types/property-type/email/".to_owned())
            .expect("valid URL");
        config.protect_property(
            phone_url,
            config
                .property_exclusion_filter(&email_url)
                .expect("email should have filter in hash_default config")
                .clone(),
        );

        let mut compiler = SelectCompiler::<Entity>::new(None, false);

        let property_filter = config.to_property_protection_filter(None);
        compiler.with_property_masking(&property_filter);

        let _: usize = compiler.add_selection_path(&EntityQueryPath::Properties(None));

        // Note: HashMap iteration order is non-deterministic, so property order may vary.
        // We verify the SQL contains both properties with array concatenation.
        // Parameters are now used instead of hardcoded strings:
        // For each property: $N = type URL, $N+1 = actor UUID, $N+2 = property URL
        let (compiled_statement, _) = compiler.compile();
        let sql = trim_whitespace(&compiled_statement);

        // Verify structure
        assert!(
            sql.contains(r#""properties" - ("#),
            "Should have properties masking with parens for concat: {sql}"
        );
        assert!(
            sql.contains(" || "),
            "Should have array concatenation: {sql}"
        );

        // Verify CASE WHEN structure with parameters (two properties = two CASE blocks)
        assert_eq!(
            sql.matches("CASE WHEN").count(),
            2,
            "Should have two CASE WHEN blocks for two properties: {sql}"
        );

        // Verify array literals use parameters
        assert!(
            sql.contains("ARRAY[$"),
            "Should use parameters in array literals: {sql}"
        );
    }

    #[test]
    fn sorting_by_property_uses_masked_expression() {
        let config = PropertyProtectionFilterConfig::hash_default();

        let mut compiler = SelectCompiler::<Entity>::new(None, false);

        let property_filter = config.to_property_protection_filter(None);
        compiler.with_property_masking(&property_filter);

        // Add sorting by email property (which is protected)
        let email_path =
            EntityQueryPath::Properties(Some(JsonPath::from_path_tokens(vec![PathToken::Field(
                Cow::Owned("https://hash.ai/@h/types/property-type/email/".to_owned()),
            )])));

        compiler.add_distinct_selection_with_ordering(
            &email_path,
            Distinctness::Indistinct,
            Some((Ordering::Ascending, Some(NullOrdering::Last))),
        );

        let (compiled_statement, _) = compiler.compile();
        let sql = trim_whitespace(&compiled_statement);

        // The ORDER BY should use the masked expression, not the raw column
        // It should contain the CASE WHEN masking in the ORDER BY clause
        assert!(
            sql.contains("ORDER BY"),
            "Should have ORDER BY clause: {sql}"
        );

        // The ORDER BY expression should include the masking (properties - (CASE WHEN...))
        // followed by the JSON extraction for email
        assert!(
            sql.contains(r#"ORDER BY jsonb_path_query_first(("entity_editions_0_1_0"."properties" - (CASE WHEN"#),
            "ORDER BY should use masked properties expression: {sql}"
        );
    }
}
