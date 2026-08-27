use alloc::borrow::Cow;
use core::str::FromStr as _;

use hash_codec::numeric::Real;
use hash_graph_store::{
    data_type::DataTypeQueryPath,
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    filter::{
        Filter, FilterExpression, FilterExpressionList, JsonPath, Parameter, ParameterList,
        PathToken, protection::PropertyProtectionFilterConfig,
    },
    property_type::PropertyTypeQueryPath,
    query::{NullOrdering, Ordering},
    subgraph::{
        edges::{EdgeDirection, KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind},
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use hash_graph_temporal_versioning::Timestamp;
use hash_graph_types::Embedding;
use postgres_types::ToSql;
use type_system::{
    knowledge::{Entity, PropertyValue},
    ontology::{
        BaseUrl, DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata,
        VersionedUrl,
    },
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::ShapeFallback;
use crate::store::postgres::query::{
    Distinctness, PostgresRecord, SelectCompiler, SelectExpression, SelectStatement, SimpleSelect,
    StatementShape, Transpile as _, compile::SelectCompilerError, test_helper::trim_whitespace,
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
        .map(|parameter| format!("{parameter:?}"))
        .collect::<Vec<_>>();
    let expected_parameters = expected_parameters
        .iter()
        .map(|parameter| format!("{parameter:?}"))
        .collect::<Vec<_>>();

    pretty_assertions::assert_eq!(compiled_parameters, expected_parameters);
}

/// An equality filter pinning `path`'s column to a UUID parameter.
fn uuid_equality(path: EntityQueryPath<'static>, uuid: Uuid) -> Filter<'static, Entity> {
    Filter::Equal(
        FilterExpression::Path { path },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(uuid),
            convert: None,
        },
    )
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
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("data_types_0_1_0"."schema"->>'$id' = $2)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_temporal_metadata_0_0_0"."entity_uuid" = $3)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."entity_uuid" = $1)
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
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND (("ontology_ids_0_1_0"."base_url" = $2) AND ("ontology_ids_0_1_0"."version" = $3))
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
        WITH "ontology_ids" AS (SELECT *, MAX("ontology_ids_0_0_0"."version") OVER (PARTITION BY "ontology_ids_0_0_0"."base_url") AS "latest_version"
        FROM "ontology_ids" AS "ontology_ids_0_0_0")
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        INNER JOIN "ontology_ids" AS "ontology_ids_0_1_0"
          ON "ontology_ids_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version")
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
        WITH "ontology_ids" AS (SELECT *, MAX("ontology_ids_0_0_0"."version") OVER (PARTITION BY "ontology_ids_0_0_0"."base_url") AS "latest_version"
        FROM "ontology_ids" AS "ontology_ids_0_0_0")
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        INNER JOIN "ontology_ids" AS "ontology_ids_0_1_0"
          ON "ontology_ids_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("ontology_ids_0_1_0"."version" != "ontology_ids_0_1_0"."latest_version")
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
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("data_types_0_3_0"."schema"->>'title' = $2)
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
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("data_types_0_3_0"."schema"->>'title' = $2)
          AND (("ontology_ids_1_3_0"."base_url" = $3) AND ("ontology_ids_1_3_0"."version" = $4))
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
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("property_types_0_3_0"."schema"->>'title' = $2)
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
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("property_types_0_3_0"."schema"->>'title' = $2)
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
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
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
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_types_0_5_0"."schema"->>'title' = $2)
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
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("ontology_ids_0_3_0"."base_url" = $2)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_temporal_metadata_0_0_0"."entity_uuid" = $3)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_ids_0_1_0"."created_by_id" = $3)
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
        SELECT DISTINCT ON("entity_ids_0_1_0"."created_at_transaction_time") "entity_ids_0_1_0"."created_at_transaction_time"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_ids" AS "entity_ids_0_1_0"
          ON "entity_ids_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_ids_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
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
        SELECT DISTINCT ON("entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."decision_time") "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."decision_time", "entity_editions_0_1_0"."properties"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
          ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_temporal_metadata_0_0_0"."draft_id" = $3)
        ORDER BY "entity_temporal_metadata_0_0_0"."entity_uuid" ASC, "entity_temporal_metadata_0_0_0"."decision_time" DESC NULLS LAST
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $2::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $3)
          AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($1::text)::jsonpath)) = $4)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $2::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $3)
          AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($1::text)::jsonpath)) IS NOT NULL)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_temporal_metadata_0_4_0"."entity_edition_id" = $3)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_temporal_metadata_0_4_0"."entity_edition_id" = $3)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND (("entity_has_left_entity_0_1_0"."left_entity_uuid" = $3) AND ("entity_has_left_entity_0_1_0"."left_web_id" = $4) AND ("entity_has_right_entity_0_1_0"."right_entity_uuid" = $5) AND ("entity_has_right_entity_0_1_0"."right_web_id" = $6))
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_has_right_entity_0_1_0"."right_entity_uuid" = $3)
          AND ("entity_has_right_entity_1_1_0"."right_entity_uuid" = $4)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND (("entity_has_right_entity_0_1_0"."right_entity_uuid" = $3) AND ("entity_has_right_entity_0_1_0"."right_entity_uuid" = $4))
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND (("ontology_ids_0_5_0"."base_url" = $3) AND ("ontology_ids_0_5_1"."base_url" = $4))
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_edition_cache_0_1_0"."versioned_urls" @> ARRAY[$3]::text[])
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND (("entity_edition_cache_0_1_0"."versioned_urls" @> ARRAY[$3]::text[]) AND ("entity_edition_cache_0_3_0"."versioned_urls" @> ARRAY[$4]::text[]))
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND (NOT("entity_edition_cache_0_1_0"."versioned_urls" @> ARRAY[$3]::text[]))
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_edition_cache_0_1_0"."base_urls" @> ARRAY[$3]::text[])
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &"https://example.com/@example-org/types/entity-type/address/",
        ],
    );
}

/// A semantic read ranks candidates under the permission filter rather than filtering the ranked
/// rows, so the statement carrying `ORDER BY … LIMIT` has to carry the permission predicate too.
/// Were the two split across statements, the limit would cut the candidates before the permission
/// filter saw them and a restricted actor would get too few results, and the wrong ones.
#[test]
fn semantic_ordering_ranks_under_the_permission_filter() {
    let permitted_webs = [WebId::new(Uuid::from_u128(1))];
    let embedding = Embedding::from(vec![0.0; 3072]);

    let mut compiler = SelectCompiler::<Entity>::with_asterisk(None, false);

    // The shape `Filter::for_policies` produces for an actor permitted a set of webs.
    let permission_filter = Filter::In(
        FilterExpression::Path {
            path: EntityQueryPath::WebId,
        },
        FilterExpressionList::ParameterList {
            parameters: ParameterList::WebIds(&permitted_webs),
        },
    );
    compiler
        .add_filter(&permission_filter)
        .expect("the permission filter should compile");
    let embeddings_alias = compiler
        .rank_by_quantized_distance(&EntityQueryPath::Embedding, &embedding)
        .expect("the embedding path should have a quantized form to rank on");
    compiler.restrict_embedding_property(embeddings_alias, None);
    compiler.set_limit(400);

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_embeddings" AS "entity_embeddings_1_1_0"
          ON "entity_embeddings_1_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_embeddings_1_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."web_id" = ANY($1))
          AND ("entity_embeddings_1_1_0"."property" IS NULL)
        ORDER BY "entity_embeddings_1_1_0"."embedding_bits" <~> binary_quantize(($2::vector)) ASC
        LIMIT 400
        "#,
        &[&permitted_webs.as_slice(), &embedding],
    );
}

/// The per-property embedding space is addressed by equality on the `property` column instead of
/// its `IS NULL` row.
#[test]
fn semantic_ordering_selects_one_embedding_space() {
    let embedding = Embedding::from(vec![0.0; 3072]);
    let property = "https://example.com/@example-org/types/property-type/name/";

    let mut compiler = SelectCompiler::<Entity>::with_asterisk(None, false);
    let embeddings_alias = compiler
        .rank_by_quantized_distance(&EntityQueryPath::Embedding, &embedding)
        .expect("the embedding path should have a quantized form to rank on");
    compiler.restrict_embedding_property(embeddings_alias, Some(&property));
    compiler.set_limit(400);

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_embeddings" AS "entity_embeddings_0_1_0"
          ON "entity_embeddings_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_embeddings_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_embeddings_0_1_0"."property" = $2)
        ORDER BY "entity_embeddings_0_1_0"."embedding_bits" <~> binary_quantize(($1::vector)) ASC
        LIMIT 400
        "#,
        &[&embedding, &property],
    );
}

/// `entity_type_embeddings` has no `property` column, so ranking entity types needs no space
/// restriction.
#[test]
fn semantic_ordering_ranks_entity_types() {
    let embedding = Embedding::from(vec![0.0; 3072]);

    let mut compiler = SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(None, false);
    compiler
        .rank_by_quantized_distance(&EntityTypeQueryPath::Embedding, &embedding)
        .expect("the embedding path should have a quantized form to rank on");
    compiler.set_limit(400);

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        INNER JOIN "entity_type_embeddings" AS "entity_type_embeddings_0_1_0"
          ON "entity_type_embeddings_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        ORDER BY "entity_type_embeddings_0_1_0"."embedding_bits" <~> binary_quantize(($1::vector)) ASC
        LIMIT 400
        "#,
        &[&embedding],
    );
}

/// One branch of the permit disjunction as [`Filter::for_policy_branches`] shapes it — the permit
/// with every forbid negated — compiled together with the request filter. A branch replaces the
/// top-level permit disjunction with a conjunction; a permit can still hold a disjunction of its
/// own, which then stays inside the branch.
#[test]
fn semantic_ordering_compiles_a_policy_branch() {
    let permitted_webs = [WebId::new(Uuid::from_u128(1))];
    let forbidden_uuid = Uuid::from_u128(2);
    let embedding = Embedding::from(vec![0.0; 3072]);

    let mut compiler = SelectCompiler::<Entity>::with_asterisk(None, false);

    let policy_branch = Filter::All(vec![
        Filter::In(
            FilterExpression::Path {
                path: EntityQueryPath::WebId,
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::WebIds(&permitted_webs),
            },
        ),
        Filter::Not(Box::new(Filter::Any(vec![Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::Uuid,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(forbidden_uuid),
                convert: None,
            },
        )]))),
    ]);
    let request_filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::Archived,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Boolean(false),
            convert: None,
        },
    );

    compiler
        .add_filter(&policy_branch)
        .expect("the policy branch should compile");
    compiler
        .add_filter(&request_filter)
        .expect("the request filter should compile");
    let embeddings_alias = compiler
        .rank_by_quantized_distance(&EntityQueryPath::Embedding, &embedding)
        .expect("the embedding path should have a quantized form to rank on");
    compiler.restrict_embedding_property(embeddings_alias, None);
    compiler.set_limit(400);

    test_compilation(
        &compiler,
        r#"
        SELECT *
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_editions" AS "entity_editions_1_1_0"
          ON "entity_editions_1_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        INNER JOIN "entity_embeddings" AS "entity_embeddings_2_1_0"
          ON "entity_embeddings_2_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_embeddings_2_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND (("entity_temporal_metadata_0_0_0"."web_id" = ANY($1))
          AND (NOT("entity_temporal_metadata_0_0_0"."entity_uuid" = $2)))
          AND ("entity_editions_1_1_0"."archived" = $3)
          AND ("entity_embeddings_2_1_0"."property" IS NULL)
        ORDER BY "entity_embeddings_2_1_0"."embedding_bits" <~> binary_quantize(($4::vector)) ASC
        LIMIT 400
        "#,
        &[
            &permitted_webs.as_slice(),
            &forbidden_uuid,
            &false,
            &embedding,
        ],
    );
}

/// The branch split end to end: the policies go through [`Filter::for_policy_branches`] and
/// every branch compiles to its own statement, so a change to the branch assembly shows up here
/// as a changed statement.
#[test]
fn semantic_ordering_compiles_the_policy_branch_split() {
    use hash_graph_authorization::policies::{
        Effect, OptimizationData,
        resource::{EntityResourceConstraint, ResourceConstraint},
    };
    use type_system::{
        knowledge::entity::id::EntityUuid,
        principal::actor::{ActorId, UserId},
    };

    let embedding = Embedding::from(vec![0.0; 3072]);
    let actor_id = Some(ActorId::User(UserId::new(Uuid::from_u128(10))));

    let permitted_entity = Uuid::from_u128(1);
    let forbidden_entity = Uuid::from_u128(2);
    let permit = ResourceConstraint::Entity(EntityResourceConstraint::Exact {
        id: EntityUuid::new(permitted_entity),
    });
    let forbid = ResourceConstraint::Entity(EntityResourceConstraint::Exact {
        id: EntityUuid::new(forbidden_entity),
    });
    let optimization_data = OptimizationData {
        permitted_web_ids: vec![
            WebId::new(Uuid::from_u128(3)),
            WebId::new(Uuid::from_u128(4)),
        ],
        ..OptimizationData::default()
    };

    let branches = Filter::<Entity>::for_policy_branches(
        [
            (Effect::Permit, Some(&permit)),
            (Effect::Forbid, Some(&forbid)),
        ],
        actor_id,
        &optimization_data,
    );
    assert_eq!(
        branches.len(),
        2,
        "the policies should split into an entity permit and a web permit branch"
    );

    let expectations: [(&str, &[&dyn ToSql]); 2] = [
        (
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_embeddings" AS "entity_embeddings_1_1_0"
              ON "entity_embeddings_1_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
             AND "entity_embeddings_1_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
            WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
              AND (("entity_temporal_metadata_0_0_0"."entity_uuid" = $1)
              AND (NOT("entity_temporal_metadata_0_0_0"."entity_uuid" = $2)))
              AND ("entity_embeddings_1_1_0"."property" IS NULL)
            ORDER BY "entity_embeddings_1_1_0"."embedding_bits" <~> binary_quantize(($3::vector)) ASC
            LIMIT 400
            "#,
            &[&permitted_entity, &forbidden_entity, &embedding],
        ),
        (
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_embeddings" AS "entity_embeddings_1_1_0"
              ON "entity_embeddings_1_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
             AND "entity_embeddings_1_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
            WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
              AND (("entity_temporal_metadata_0_0_0"."web_id" = ANY($1))
              AND (NOT("entity_temporal_metadata_0_0_0"."entity_uuid" = $2)))
              AND ("entity_embeddings_1_1_0"."property" IS NULL)
            ORDER BY "entity_embeddings_1_1_0"."embedding_bits" <~> binary_quantize(($3::vector)) ASC
            LIMIT 400
            "#,
            &[
                &optimization_data.permitted_web_ids.as_slice(),
                &forbidden_entity,
                &embedding,
            ],
        ),
    ];

    for (branch, (expected_statement, expected_parameters)) in branches.iter().zip(expectations) {
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(None, false);
        compiler
            .add_filter(branch)
            .expect("the policy branch should compile");
        let embeddings_alias = compiler
            .rank_by_quantized_distance(&EntityQueryPath::Embedding, &embedding)
            .expect("the embedding path should have a quantized form to rank on");
        compiler.restrict_embedding_property(embeddings_alias, None);
        compiler.set_limit(400);

        test_compilation(&compiler, expected_statement, expected_parameters);
    }
}

/// The statement core every branch key-read shares: temporal axes, key selections, ranking, and
/// the embedding-space restriction. The per-branch policy and request filters are pinned
/// separately. The key columns are read back positionally, so this pins their order alongside
/// the ranking shape.
#[test]
fn semantic_ordering_production_shape() {
    let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let embedding = Embedding::from(vec![0.0; 3072]);

    let web_id_path = EntityQueryPath::WebId;
    let uuid_path = EntityQueryPath::Uuid;
    let draft_id_path = EntityQueryPath::DraftId;

    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), false);
    compiler.add_selection_path(&web_id_path);
    compiler.add_selection_path(&uuid_path);
    compiler.add_selection_path(&draft_id_path);
    let embeddings_alias = compiler
        .rank_by_quantized_distance(&EntityQueryPath::Embedding, &embedding)
        .expect("the embedding path should have a quantized form to rank on");
    compiler.restrict_embedding_property(embeddings_alias, None);
    compiler.set_limit(400);

    test_compilation(
        &compiler,
        r#"
        SELECT "entity_temporal_metadata_0_0_0"."web_id", "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."draft_id"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_embeddings" AS "entity_embeddings_0_1_0"
          ON "entity_embeddings_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_embeddings_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_embeddings_0_1_0"."property" IS NULL)
        ORDER BY "entity_embeddings_0_1_0"."embedding_bits" <~> binary_quantize(($3::vector)) ASC
        LIMIT 400
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &embedding,
        ],
    );
}

#[test]
fn semantic_ordering_rejects_non_embedding_paths() {
    let embedding = Embedding::from(vec![0.0; 3072]);

    let mut compiler = SelectCompiler::<Entity>::with_asterisk(None, false);
    let error = compiler
        .rank_by_quantized_distance(&EntityQueryPath::Uuid, &embedding)
        .expect_err("a non-embedding path should have no quantized form to rank on");
    assert!(matches!(
        error.current_context(),
        SelectCompilerError::UnsupportedEmbeddingPath
    ));
}

#[test]
fn cursor_after_semantic_ordering_is_rejected() {
    let embedding = Embedding::from(vec![0.0; 3072]);

    let mut compiler = SelectCompiler::<Entity>::with_asterisk(None, false);
    compiler
        .rank_by_quantized_distance(&EntityQueryPath::Embedding, &embedding)
        .expect("the embedding path should have a quantized form to rank on");

    let error = compiler
        .add_cursor_selection(
            &EntityQueryPath::Uuid,
            core::convert::identity,
            None,
            Ordering::Ascending,
            None,
        )
        .expect_err("a cursor is not allowed after a semantic ranking");
    assert!(matches!(
        error.current_context(),
        SelectCompilerError::CursorDisallowed { .. }
    ));
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
        SELECT DISTINCT ON(("entity_edition_cache_0_1_0"."labels")[1], ("entity_edition_cache_0_1_0"."type_titles")[1]) ("entity_edition_cache_0_1_0"."labels")[1], ("entity_edition_cache_0_1_0"."type_titles")[1]
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0"
          ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
        ORDER BY ("entity_edition_cache_0_1_0"."labels")[1] ASC NULLS LAST, ("entity_edition_cache_0_1_0"."type_titles")[1] DESC NULLS LAST
        "#,
        &[&pinned_timestamp, &temporal_axes.variable_interval()],
    );
}

#[test]
fn transpile_offset() {
    let statement = SelectStatement::builder()
        .select_clause(SimpleSelect::builder().selects(vec![SelectExpression::Asterisk(None)]))
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
        knowledge::entity::id::{DraftId, EntityId, EntityUuid},
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
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND (("ontology_ids_0_1_0"."base_url" = $2) AND ("ontology_ids_0_1_0"."version" = $3))
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
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND (("entity_temporal_metadata_0_0_0"."web_id" = $3) AND ("entity_temporal_metadata_0_0_0"."entity_uuid" = $4))
        "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &Uuid::from(entity_id.web_id),
                &Uuid::from(entity_id.entity_uuid),
            ],
        );
    }

    fn published_entity_id() -> EntityId {
        EntityId {
            web_id: WebId::new(Uuid::new_v4()),
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: None,
        }
    }

    fn drafted_entity_id() -> EntityId {
        EntityId {
            web_id: WebId::new(Uuid::new_v4()),
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: Some(DraftId::new(Uuid::new_v4())),
        }
    }

    /// An `Any` of published-entity identities bundles into one row-membership predicate
    /// over the unnested pair arrays instead of an N-way disjunction, which planned as a
    /// `BitmapOr` with one index-scan branch per identity. The tuple's column order is
    /// canonical (sorted by the column's transpiled identity), so `entity_uuid` leads.
    #[test]
    fn for_entity_by_entity_ids_bundle_into_pair_membership() {
        let ids = [
            published_entity_id(),
            published_entity_id(),
            published_entity_id(),
        ];

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

        let filter = Filter::Any(ids.map(Filter::for_entity_by_entity_id).to_vec());
        compiler.add_filter(&filter).expect("Failed to add filter");

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
              AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
              AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
              AND (ROW("entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."web_id") = ANY(SELECT "unnest_0_0_0"."elem_1", "unnest_0_0_0"."elem_2" FROM UNNEST(($3::uuid[]), ($4::uuid[])) AS "unnest_0_0_0"("elem_1", "elem_2")))
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &[
                    Uuid::from(ids[0].entity_uuid),
                    Uuid::from(ids[1].entity_uuid),
                    Uuid::from(ids[2].entity_uuid),
                ],
                &[
                    Uuid::from(ids[0].web_id),
                    Uuid::from(ids[1].web_id),
                    Uuid::from(ids[2].web_id),
                ],
            ],
        );
    }

    /// A nested `Any` states the same disjunction, so its identities bundle with the outer
    /// group's into one membership predicate rather than one predicate per nesting level.
    #[test]
    fn nested_any_groups_bundle_across_the_boundary() {
        let ids = [
            published_entity_id(),
            published_entity_id(),
            published_entity_id(),
        ];

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

        let filter = Filter::Any(vec![
            Filter::Any(vec![
                Filter::for_entity_by_entity_id(ids[0]),
                Filter::for_entity_by_entity_id(ids[1]),
            ]),
            Filter::for_entity_by_entity_id(ids[2]),
        ]);
        compiler.add_filter(&filter).expect("Failed to add filter");

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
              AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
              AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
              AND (ROW("entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."web_id") = ANY(SELECT "unnest_0_0_0"."elem_1", "unnest_0_0_0"."elem_2" FROM UNNEST(($3::uuid[]), ($4::uuid[])) AS "unnest_0_0_0"("elem_1", "elem_2")))
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &[
                    Uuid::from(ids[0].entity_uuid),
                    Uuid::from(ids[1].entity_uuid),
                    Uuid::from(ids[2].entity_uuid),
                ],
                &[
                    Uuid::from(ids[0].web_id),
                    Uuid::from(ids[1].web_id),
                    Uuid::from(ids[2].web_id),
                ],
            ],
        );
    }

    /// `All([x])`, `Any([x])` and `x` decide alike, so redundant singleton groups inside an
    /// identity conjunction dissolve and the conjunction still recognizes as a tuple.
    #[test]
    fn singleton_groups_dissolve_before_recognition() {
        let ids = [published_entity_id(), published_entity_id()];

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

        let filter = Filter::Any(vec![
            Filter::All(vec![
                uuid_equality(EntityQueryPath::WebId, Uuid::from(ids[0].web_id)),
                Filter::Any(vec![Filter::All(vec![uuid_equality(
                    EntityQueryPath::Uuid,
                    Uuid::from(ids[0].entity_uuid),
                )])]),
            ]),
            Filter::for_entity_by_entity_id(ids[1]),
        ]);
        compiler.add_filter(&filter).expect("Failed to add filter");

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
              AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
              AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
              AND (ROW("entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."web_id") = ANY(SELECT "unnest_0_0_0"."elem_1", "unnest_0_0_0"."elem_2" FROM UNNEST(($3::uuid[]), ($4::uuid[])) AS "unnest_0_0_0"("elem_1", "elem_2")))
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &[
                    Uuid::from(ids[0].entity_uuid),
                    Uuid::from(ids[1].entity_uuid),
                ],
                &[Uuid::from(ids[0].web_id), Uuid::from(ids[1].web_id)],
            ],
        );
    }

    /// A single identity gains nothing from an unnest, so it keeps its direct conjunction
    /// and the identity indexes serve it. The conjunction is built from the recognizer's
    /// resolved halves, so its column order is canonical (`entity_uuid` before `web_id`)
    /// rather than the group's own.
    #[test]
    fn for_entity_by_entity_id_alone_stays_direct() {
        let entity_id = published_entity_id();

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

        let filter = Filter::Any(vec![Filter::for_entity_by_entity_id(entity_id)]);
        compiler.add_filter(&filter).expect("Failed to add filter");

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
              AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
              AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
              AND (("entity_temporal_metadata_0_0_0"."entity_uuid" = $3) AND ("entity_temporal_metadata_0_0_0"."web_id" = $4))
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &Uuid::from(entity_id.entity_uuid),
                &Uuid::from(entity_id.web_id),
            ],
        );
    }

    /// A specially-compiled equality inside a recognized tuple sends the whole group
    /// back to the plain path. `version == "latest"` passes every scalar check, since
    /// the version column is a hook-free int8 with no JSON field. Built as a direct
    /// equality it would drop the latest-version rewrite and bind the text `"latest"`
    /// against that int8 column, which Postgres rejects at execution (`invalid input
    /// syntax for type bigint`) after the filter's meaning already changed. The
    /// recognizer refuses whatever [`SelectCompiler::compile_special_filter`]'s shared
    /// predicate claims, so the group compiles with the `ontology_ids` CTE exactly as
    /// it does outside an `Any` group. Review r3 caught this on the live DB; the
    /// earlier suite was all-uuid, which is why no test here failed.
    #[test]
    fn latest_version_pair_in_any_group_keeps_the_cte() {
        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler =
            SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes), false);

        let filter = Filter::Any(vec![Filter::All(vec![
            Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Version,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("latest")),
                    convert: None,
                },
            ),
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
        ])]);
        compiler.add_filter(&filter).expect("Failed to add filter");

        test_compilation(
            &compiler,
            r#"
            WITH "ontology_ids" AS (SELECT *, MAX("ontology_ids_0_0_0"."version") OVER (PARTITION BY "ontology_ids_0_0_0"."base_url") AS "latest_version" FROM "ontology_ids" AS "ontology_ids_0_0_0")
            SELECT *
            FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
            INNER JOIN "ontology_ids" AS "ontology_ids_0_1_0"
              ON "ontology_ids_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
            WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
              AND (("ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version") AND ("ontology_ids_0_1_0"."base_url" = $2))
            "#,
            &[
                &pinned_timestamp,
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
            ],
        );
    }

    /// A tuple whose columns stand on two tables is excluded from bundling: its
    /// membership form would be a condition above the join, which the planner answers by
    /// materializing the whole join first (measured at 14x the disjunction). The shape is
    /// client-reachable (the REST filter body deserializes arbitrary `Any`/`All` nesting,
    /// and a custom web policy builds it through `CreatedByPrincipal`), so it must stay a
    /// plain disjunction of conjunctions with each qual pushed to its own table.
    #[test]
    fn cross_table_uuid_pairs_stay_direct() {
        let webs = [Uuid::new_v4(), Uuid::new_v4()];
        let actors = [Uuid::new_v4(), Uuid::new_v4()];

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

        let filter = Filter::Any(
            webs.into_iter()
                .zip(actors)
                .map(|(web_id, actor_id)| {
                    Filter::All(vec![
                        Filter::Equal(
                            FilterExpression::Path {
                                path: EntityQueryPath::WebId,
                            },
                            FilterExpression::Parameter {
                                parameter: Parameter::Uuid(web_id),
                                convert: None,
                            },
                        ),
                        Filter::Equal(
                            FilterExpression::Path {
                                path: EntityQueryPath::CreatedById,
                            },
                            FilterExpression::Parameter {
                                parameter: Parameter::Uuid(actor_id),
                                convert: None,
                            },
                        ),
                    ])
                })
                .collect(),
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
            WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
              AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
              AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
              AND (((("entity_ids_0_1_0"."created_by_id" = $3) AND ("entity_temporal_metadata_0_0_0"."web_id" = $4)) OR (("entity_ids_0_1_0"."created_by_id" = $5) AND ("entity_temporal_metadata_0_0_0"."web_id" = $6))))
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &actors[0],
                &webs[0],
                &actors[1],
                &webs[1],
            ],
        );
    }

    /// Drafted identities carry a third equality, so they bundle as their own
    /// three-column tuple beside the published pairs: two membership predicates and no
    /// disjunction tail. Canonical order puts `draft_id` first, then `entity_uuid`, then
    /// `web_id`.
    #[test]
    fn drafted_entity_ids_bundle_as_their_own_triple() {
        let published = [published_entity_id(), published_entity_id()];
        let drafted = [drafted_entity_id(), drafted_entity_id()];

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), true);

        let filter = Filter::Any(vec![
            Filter::for_entity_by_entity_id(published[0]),
            Filter::for_entity_by_entity_id(drafted[0]),
            Filter::for_entity_by_entity_id(published[1]),
            Filter::for_entity_by_entity_id(drafted[1]),
        ]);
        compiler.add_filter(&filter).expect("Failed to add filter");

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
              AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
              AND (((ROW("entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."web_id") = ANY(SELECT "unnest_0_0_0"."elem_1", "unnest_0_0_0"."elem_2" FROM UNNEST(($3::uuid[]), ($4::uuid[])) AS "unnest_0_0_0"("elem_1", "elem_2"))) OR (ROW("entity_temporal_metadata_0_0_0"."draft_id", "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."web_id") = ANY(SELECT "unnest_0_0_1"."elem_1", "unnest_0_0_1"."elem_2", "unnest_0_0_1"."elem_3" FROM UNNEST(($5::uuid[]), ($6::uuid[]), ($7::uuid[])) AS "unnest_0_0_1"("elem_1", "elem_2", "elem_3")))))
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &[
                    Uuid::from(published[0].entity_uuid),
                    Uuid::from(published[1].entity_uuid),
                ],
                &[
                    Uuid::from(published[0].web_id),
                    Uuid::from(published[1].web_id),
                ],
                &[
                    Uuid::from(drafted[0].draft_id.expect("drafted id")),
                    Uuid::from(drafted[1].draft_id.expect("drafted id")),
                ],
                &[
                    Uuid::from(drafted[0].entity_uuid),
                    Uuid::from(drafted[1].entity_uuid),
                ],
                &[Uuid::from(drafted[0].web_id), Uuid::from(drafted[1].web_id)],
            ],
        );
    }

    /// A tuple is as wide as its group pins columns: four same-table equalities bundle
    /// into a four-member membership, whatever order the group wrote them in.
    #[test]
    fn four_column_tuples_bundle_at_their_own_width() {
        let tuples: [[Uuid; 4]; 2] = [
            [
                Uuid::new_v4(),
                Uuid::new_v4(),
                Uuid::new_v4(),
                Uuid::new_v4(),
            ],
            [
                Uuid::new_v4(),
                Uuid::new_v4(),
                Uuid::new_v4(),
                Uuid::new_v4(),
            ],
        ];

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), true);

        // Written web → edition → uuid → draft, and canonical order sorts draft_id first.
        let filter = Filter::Any(
            tuples
                .iter()
                .map(|&[draft, edition, uuid, web]| {
                    Filter::All(vec![
                        uuid_equality(EntityQueryPath::WebId, web),
                        uuid_equality(EntityQueryPath::EditionId, edition),
                        uuid_equality(EntityQueryPath::Uuid, uuid),
                        uuid_equality(EntityQueryPath::DraftId, draft),
                    ])
                })
                .collect(),
        );
        compiler.add_filter(&filter).expect("Failed to add filter");

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
              AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
              AND (ROW("entity_temporal_metadata_0_0_0"."draft_id", "entity_temporal_metadata_0_0_0"."entity_edition_id", "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."web_id") = ANY(SELECT "unnest_0_0_0"."elem_1", "unnest_0_0_0"."elem_2", "unnest_0_0_0"."elem_3", "unnest_0_0_0"."elem_4" FROM UNNEST(($3::uuid[]), ($4::uuid[]), ($5::uuid[]), ($6::uuid[])) AS "unnest_0_0_0"("elem_1", "elem_2", "elem_3", "elem_4")))
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &[tuples[0][0], tuples[1][0]],
                &[tuples[0][1], tuples[1][1]],
                &[tuples[0][2], tuples[1][2]],
                &[tuples[0][3], tuples[1][3]],
            ],
        );
    }

    /// Each member's array carries its own column's stored type, so a tuple mixing a
    /// timestamp column with a uuid column binds `timestamptz[]` beside `uuid[]`.
    #[test]
    fn mixed_type_tuples_type_each_array_from_its_column() {
        let actors = [Uuid::new_v4(), Uuid::new_v4()];

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

        let filter = Filter::Any(
            actors
                .iter()
                .map(|&actor| {
                    Filter::All(vec![
                        uuid_equality(EntityQueryPath::CreatedById, actor),
                        Filter::Equal(
                            FilterExpression::Path {
                                path: EntityQueryPath::CreatedAtTransactionTime,
                            },
                            FilterExpression::Parameter {
                                parameter: Parameter::Timestamp(Timestamp::UNIX_EPOCH),
                                convert: None,
                            },
                        ),
                    ])
                })
                .collect(),
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
            WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
              AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
              AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
              AND (ROW("entity_ids_0_1_0"."created_at_transaction_time", "entity_ids_0_1_0"."created_by_id") = ANY(SELECT "unnest_0_0_0"."elem_1", "unnest_0_0_0"."elem_2" FROM UNNEST(($3::timestamptz[]), ($4::uuid[])) AS "unnest_0_0_0"("elem_1", "elem_2")))
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &[Timestamp::<()>::UNIX_EPOCH, Timestamp::<()>::UNIX_EPOCH],
                &[actors[0], actors[1]],
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
                "entity_edition_cache_0_1_0"."base_urls" @> ARRAY[$1]::text[]
                THEN ARRAY[$2]::text[]
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

/// The column-tuple recognizer against its oracle: every shape it gathers and then
/// excludes must compile to the bytes the plain path produces, and every exclusion must
/// keep the semantics the plain path owns.
mod tuple_bundling {
    use super::*;

    fn compile(filter: &Filter<'_, Entity>) -> (String, Vec<String>) {
        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        compile_with(&temporal_axes, filter)
    }

    fn compile_with(
        temporal_axes: &hash_graph_store::subgraph::temporal_axes::QueryTemporalAxes,
        filter: &Filter<'_, Entity>,
    ) -> (String, Vec<String>) {
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(temporal_axes), false);
        compiler.add_filter(filter).expect("should compile");
        let (statement, parameters) = compiler.compile();
        (
            trim_whitespace(&statement),
            parameters
                .map(|parameter| format!("{parameter:?}"))
                .collect(),
        )
    }

    /// For every shape the recognizer gathers and then excludes, the hand-built
    /// conjunction must be the expression the re-compile would have produced. The oracle
    /// is the same equalities in canonical order under an `All` group, which the
    /// recognizer never sees and which therefore still goes through `compile_filter` and
    /// `compile_path_column`.
    #[track_caller]
    fn assert_matches_recompile(
        recognized: Vec<Filter<'static, Entity>>,
        canonical_order: Vec<Filter<'static, Entity>>,
    ) {
        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let through_recognizer =
            compile_with(&temporal_axes, &Filter::Any(vec![Filter::All(recognized)]));
        let through_compile_filter = compile_with(
            &temporal_axes,
            &Filter::All(vec![Filter::All(canonical_order)]),
        );
        pretty_assertions::assert_eq!(
            through_recognizer.0,
            through_compile_filter.0,
            "the hand-built conjunction is not what the re-compile produces"
        );
        pretty_assertions::assert_eq!(through_recognizer.1, through_compile_filter.1);
    }

    #[test]
    fn singleton_pair_matches_recompile() {
        let web = Uuid::new_v4();
        let uuid = Uuid::new_v4();
        assert_matches_recompile(
            vec![
                uuid_equality(EntityQueryPath::WebId, web),
                uuid_equality(EntityQueryPath::Uuid, uuid),
            ],
            vec![
                uuid_equality(EntityQueryPath::Uuid, uuid),
                uuid_equality(EntityQueryPath::WebId, web),
            ],
        );
    }

    #[test]
    fn repeated_column_matches_recompile() {
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        assert_matches_recompile(
            vec![
                uuid_equality(EntityQueryPath::Uuid, first),
                uuid_equality(EntityQueryPath::Uuid, second),
            ],
            vec![
                uuid_equality(EntityQueryPath::Uuid, first),
                uuid_equality(EntityQueryPath::Uuid, second),
            ],
        );
    }

    #[test]
    fn cross_table_pair_matches_recompile() {
        let web = Uuid::new_v4();
        let creator = Uuid::new_v4();
        assert_matches_recompile(
            vec![
                uuid_equality(EntityQueryPath::WebId, web),
                uuid_equality(EntityQueryPath::CreatedById, creator),
            ],
            vec![
                uuid_equality(EntityQueryPath::CreatedById, creator),
                uuid_equality(EntityQueryPath::WebId, web),
            ],
        );
    }

    #[test]
    fn cross_table_triple_matches_recompile() {
        let web = Uuid::new_v4();
        let uuid = Uuid::new_v4();
        let creator = Uuid::new_v4();
        assert_matches_recompile(
            vec![
                uuid_equality(EntityQueryPath::WebId, web),
                uuid_equality(EntityQueryPath::Uuid, uuid),
                uuid_equality(EntityQueryPath::CreatedById, creator),
            ],
            vec![
                uuid_equality(EntityQueryPath::CreatedById, creator),
                uuid_equality(EntityQueryPath::Uuid, uuid),
                uuid_equality(EntityQueryPath::WebId, web),
            ],
        );
    }

    /// A triple standing on three tables at once.
    #[test]
    fn three_table_triple_stays_direct() {
        let (statement, _) = compile(&Filter::Any(vec![Filter::All(vec![
            uuid_equality(EntityQueryPath::WebId, Uuid::new_v4()),
            uuid_equality(EntityQueryPath::CreatedById, Uuid::new_v4()),
            uuid_equality(EntityQueryPath::EditionCreatedById, Uuid::new_v4()),
        ])]));
        assert!(
            !statement.contains("UNNEST"),
            "a three-table triple was bundled: {statement}"
        );
    }

    /// The `bundleable` fold checks `correlation` equality on *adjacent* pairs of the
    /// sorted halves, which is only sound because the sort key (`<table>.<column>`)
    /// groups by table. This triple interleaves tables A, B, A when sorted by column name
    /// alone, so it is the shape that would be wrongly bundled if the sort key ever
    /// narrowed.
    #[test]
    fn interleaving_triple_stays_direct() {
        let (statement, _) = compile(&Filter::Any(vec![Filter::All(vec![
            uuid_equality(EntityQueryPath::Uuid, Uuid::new_v4()),
            uuid_equality(
                EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::Uuid),
                    direction: EdgeDirection::Outgoing,
                },
                Uuid::new_v4(),
            ),
            uuid_equality(EntityQueryPath::WebId, Uuid::new_v4()),
        ])]));
        assert!(
            !statement.contains("UNNEST"),
            "a two-table triple was bundled: {statement}"
        );
    }

    /// A column whose members mix parameter variants has no single typed array to bind, so
    /// the bundle falls back to one parameter per member inside array literals, exactly as
    /// the direct equalities would have bound them.
    #[test]
    fn mixed_variant_members_bind_per_element() {
        let (statement, parameters) = compile(&Filter::Any(vec![
            Filter::All(vec![
                uuid_equality(EntityQueryPath::WebId, Uuid::new_v4()),
                uuid_equality(EntityQueryPath::Uuid, Uuid::new_v4()),
            ]),
            Filter::All(vec![
                Filter::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::WebId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(Cow::Borrowed("not-a-uuid")),
                        convert: None,
                    },
                ),
                uuid_equality(EntityQueryPath::Uuid, Uuid::new_v4()),
            ]),
        ]));
        assert_eq!(
            statement.matches("FROM UNNEST").count(),
            1,
            "the bundle still compiles as one membership predicate: {statement}"
        );
        assert!(
            statement.contains("UNNEST(ARRAY[$"),
            "a mixed-variant column binds per element: {statement}"
        );
        assert_eq!(
            parameters.len(),
            6,
            "two temporal parameters and one parameter per tuple member: {statement}"
        );
    }

    /// One `Any` group carrying both bundleable and excluded tuples. The same-table pairs
    /// bundle into one membership while the cross-table pair stays direct, and no filter
    /// compiles twice.
    #[test]
    fn mixed_group_bundles_only_the_same_table_tuples() {
        let (statement, parameters) = compile(&Filter::Any(vec![
            Filter::All(vec![
                uuid_equality(EntityQueryPath::WebId, Uuid::new_v4()),
                uuid_equality(EntityQueryPath::Uuid, Uuid::new_v4()),
            ]),
            Filter::All(vec![
                uuid_equality(EntityQueryPath::WebId, Uuid::new_v4()),
                uuid_equality(EntityQueryPath::Uuid, Uuid::new_v4()),
            ]),
            Filter::All(vec![
                uuid_equality(EntityQueryPath::WebId, Uuid::new_v4()),
                uuid_equality(EntityQueryPath::CreatedById, Uuid::new_v4()),
            ]),
        ]));
        assert_eq!(
            statement.matches("FROM UNNEST").count(),
            1,
            "expected exactly one membership predicate: {statement}"
        );
        assert_eq!(
            parameters.len(),
            6,
            "two temporal parameters, the cross-table pair's two uuids, and one array per bundled \
             column: {statement}"
        );
        assert_eq!(
            statement.matches("INNER JOIN \"entity_ids\"").count(),
            1,
            "the cross-table pair should add exactly one join: {statement}"
        );
    }

    /// The excluded-shape fallback builds from the halves already resolved instead of
    /// re-compiling the filter, because a re-compile resolves the same joins a second
    /// time and leaves the first resolution orphaned in the FROM clause. Some qual must
    /// therefore reference every alias standing in FROM.
    #[test]
    fn edge_path_tuple_leaves_no_orphan_join() {
        let edge = |kind, path| EntityQueryPath::EntityEdge {
            edge_kind: kind,
            path: Box::new(path),
            direction: EdgeDirection::Outgoing,
        };
        let (statement, _) = compile(&Filter::Any(vec![
            uuid_equality(
                edge(
                    KnowledgeGraphEdgeKind::HasLeftEntity,
                    EntityQueryPath::EditionId,
                ),
                Uuid::new_v4(),
            ),
            Filter::All(vec![
                uuid_equality(
                    edge(
                        KnowledgeGraphEdgeKind::HasRightEntity,
                        EntityQueryPath::EditionId,
                    ),
                    Uuid::new_v4(),
                ),
                uuid_equality(
                    edge(
                        KnowledgeGraphEdgeKind::HasRightEntity,
                        EntityQueryPath::DraftId,
                    ),
                    Uuid::new_v4(),
                ),
            ]),
        ]));

        let joins = statement.matches(" JOIN ").count();
        let mut orphans = Vec::new();
        for alias in statement.split(" AS ").skip(1) {
            let Some(alias) = alias.split_whitespace().next() else {
                continue;
            };
            let alias = alias.trim_end_matches([',', ')']);
            // Something other than its own definition must reference every alias in
            // FROM, so `AS "x"` needs at least one `"x"."column"` elsewhere.
            if statement.matches(&format!("{alias}.")).count() == 0 {
                orphans.push(alias.to_owned());
            }
        }
        assert!(
            orphans.is_empty(),
            "orphaned aliases {orphans:?} in {joins} joins: {statement}"
        );
        assert_eq!(joins, 5, "join count drifted: {statement}");
    }

    /// An equality on an array-backed cache column means containment, never scalar
    /// equality, so the recognizer refuses the whole group and it compiles through the
    /// array predicates.
    #[test]
    fn array_backed_column_group_matches_recompile_and_keeps_containment() {
        let web = Uuid::new_v4();
        let group = || {
            vec![
                Filter::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::EntityTypeEdge {
                            edge_kind: SharedEdgeKind::IsOfType,
                            path: EntityTypeQueryPath::VersionedUrl,
                            inheritance_depth: None,
                        },
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(Cow::Borrowed(
                            "https://example.com/types/entity-type/person/v/1",
                        )),
                        convert: None,
                    },
                ),
                uuid_equality(EntityQueryPath::WebId, web),
            ]
        };
        assert_matches_recompile(group(), group());
        let (statement, _) = compile(&Filter::Any(vec![Filter::All(group())]));
        assert!(
            !statement.contains("UNNEST"),
            "an array-backed column was bundled: {statement}"
        );
        assert!(
            statement.contains("@>"),
            "the containment predicate is gone: {statement}"
        );
    }

    /// A column carrying a column hook never enters a tuple, because the tuple forms
    /// build their column references directly and would skip the hook's rewrite: a
    /// masked properties read stays masked when a filter reads it.
    #[test]
    fn hooked_column_group_stays_on_the_plain_path() {
        let config = PropertyProtectionFilterConfig::hash_default();
        let property_filter = config.to_property_protection_filter(None);

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);
        compiler.with_property_masking(&property_filter);

        let filter = Filter::Any(vec![Filter::All(vec![
            Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::Properties(None),
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Any(PropertyValue::Null),
                    convert: None,
                },
            ),
            uuid_equality(EntityQueryPath::WebId, Uuid::new_v4()),
        ])]);
        compiler.add_filter(&filter).expect("should compile");
        let (statement, _) = compiler.compile();
        assert!(
            !statement.contains("UNNEST"),
            "a hooked column was bundled: {statement}"
        );
        assert!(
            statement.contains("CASE WHEN"),
            "the masked read lost its rewrite: {statement}"
        );
    }
}

#[test]
fn entity_cursor_pagination() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), false);

    let uuid = Uuid::nil();
    let parameter = compiler.add_parameter(&uuid);
    compiler
        .add_cursor_selection(
            &EntityQueryPath::Uuid,
            core::convert::identity,
            Some(parameter),
            Ordering::Ascending,
            None,
        )
        .expect("the cursor selection should compile");
    compiler.set_limit(10);

    test_compilation(
        &compiler,
        r#"
        SELECT DISTINCT ON("entity_temporal_metadata_0_0_0"."entity_uuid") *, "entity_temporal_metadata_0_0_0"."entity_uuid"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
          AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $2::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $3)
          AND ("entity_temporal_metadata_0_0_0"."entity_uuid" > $1)
        ORDER BY "entity_temporal_metadata_0_0_0"."entity_uuid" ASC
        LIMIT 10
        "#,
        &[&uuid, &pinned_timestamp, &temporal_axes.variable_interval()],
    );
}

#[test]
fn fetch_keys_then_hydrate_entity_query() {
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
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);

    test_compilation(
        &compiler,
        r#"
        WITH "roots" AS MATERIALIZED (SELECT "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."decision_time", "entity_temporal_metadata_0_0_0"."entity_edition_id"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_temporal_metadata_0_0_0"."draft_id" = $3)),
        "limited" AS (SELECT *
        FROM "roots"
        ORDER BY "entity_uuid" ASC, "decision_time" DESC NULLS LAST
        LIMIT 10)
        SELECT DISTINCT ON("limited"."entity_uuid", "limited"."decision_time") "limited"."entity_uuid", "limited"."decision_time", "entity_editions_0_1_0"."properties"
        FROM "limited"
        INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
          ON "entity_editions_0_1_0"."entity_edition_id" = "limited"."entity_edition_id"
        ORDER BY "limited"."entity_uuid" ASC, "limited"."decision_time" DESC NULLS LAST
        LIMIT 10
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &Uuid::nil(),
        ],
    );
}

#[test]
fn filter_joined_tables_stay_out_of_the_key_projection() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);

    // Mirrors the read path's order: filters first, selections after. The archived filter
    // and the properties projection then join `entity_editions` under separate aliases, so
    // the wide columns stay out of the key query.
    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::Archived,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Boolean(false),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );
    compiler.add_selection_path(&EntityQueryPath::Properties(None));
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::KeysFirst);

    test_compilation(
        &compiler,
        r#"
        WITH "roots" AS (SELECT "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."entity_edition_id"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
          ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
        WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
          AND ("entity_editions_0_1_0"."archived" = $3)),
        "limited" AS (SELECT *
        FROM "roots"
        ORDER BY "entity_uuid" ASC
        LIMIT 10)
        SELECT DISTINCT ON("limited"."entity_uuid") "limited"."entity_uuid", "entity_editions_1_1_0"."properties"
        FROM "limited"
        INNER JOIN "entity_editions" AS "entity_editions_1_1_0"
          ON "entity_editions_1_1_0"."entity_edition_id" = "limited"."entity_edition_id"
        ORDER BY "limited"."entity_uuid" ASC
        LIMIT 10
        "#,
        &[
            &pinned_timestamp,
            &temporal_axes.variable_interval(),
            &false,
        ],
    );
}

#[test]
fn keys_first_omits_the_fence() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );
    compiler.add_selection_path(&EntityQueryPath::Properties(None));
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::KeysFirst);

    // Same split as the fenced shape, but the CTE stays inlinable for the planner.
    test_compilation(
        &compiler,
        r#"
        WITH "roots" AS (SELECT "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."entity_edition_id"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)),
        "limited" AS (SELECT *
        FROM "roots"
        ORDER BY "entity_uuid" ASC
        LIMIT 10)
        SELECT DISTINCT ON("limited"."entity_uuid") "limited"."entity_uuid", "entity_editions_0_1_0"."properties"
        FROM "limited"
        INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
          ON "entity_editions_0_1_0"."entity_edition_id" = "limited"."entity_edition_id"
        ORDER BY "limited"."entity_uuid" ASC
        LIMIT 10
        "#,
        &[&pinned_timestamp, &temporal_axes.variable_interval()],
    );
}

#[test]
fn fetch_keys_then_hydrate_requires_sort_and_limit() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();

    // Sorted but unlimited: nothing to fence off, the layout stays single-pass.
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);
    assert_eq!(
        compiler.fetch_keys_then_hydrate_statement(None).map(|_| ()),
        Err(ShapeFallback::Unlimited)
    );
    let (unlimited, _) = compiler.compile();
    compiler.set_statement_shape(StatementShape::SinglePass);
    let (single_pass, _) = compiler.compile();
    assert_eq!(unlimited, single_pass);

    // Limited but unsorted: same story.
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);
    compiler.add_selection_path(&EntityQueryPath::Uuid);
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);
    assert_eq!(
        compiler.fetch_keys_then_hydrate_statement(None).map(|_| ()),
        Err(ShapeFallback::Unsorted)
    );
    let (unsorted, _) = compiler.compile();
    compiler.set_statement_shape(StatementShape::SinglePass);
    let (single_pass, _) = compiler.compile();
    assert_eq!(unsorted, single_pass);
}

#[test]
fn fetch_keys_then_hydrate_asterisk_falls_back() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes), true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);
    assert_eq!(
        compiler.fetch_keys_then_hydrate_statement(None).map(|_| ()),
        Err(ShapeFallback::AsteriskSelect)
    );
    let (asterisk, _) = compiler.compile();
    compiler.set_statement_shape(StatementShape::SinglePass);
    let (single_pass, _) = compiler.compile();
    assert_eq!(asterisk, single_pass);
}

#[test]
fn fetch_keys_then_hydrate_to_many_filter_falls_back() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );

    // Filtering through a link edge joins fanning-out relations into the key query, whose
    // duplicates would eat into `LIMIT n`.
    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::Uuid),
                direction: EdgeDirection::Incoming,
            },
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(Uuid::nil()),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);
    assert_eq!(
        compiler.fetch_keys_then_hydrate_statement(None).map(|_| ()),
        Err(ShapeFallback::ToManyKeyJoin)
    );
    let (to_many, _) = compiler.compile();
    compiler.set_statement_shape(StatementShape::SinglePass);
    let (single_pass, _) = compiler.compile();
    assert_eq!(to_many, single_pass);
}

#[test]
fn fetch_keys_then_hydrate_sorts_across_joins() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::CreatedAtTransactionTime,
        Distinctness::Distinct,
        Some((Ordering::Descending, Some(NullOrdering::Last))),
    );
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );
    compiler.add_selection_path(&EntityQueryPath::Properties(None));
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);

    test_compilation(
        &compiler,
        r#"
        WITH "roots" AS MATERIALIZED (SELECT "entity_ids_0_1_0"."created_at_transaction_time", "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."entity_edition_id"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        INNER JOIN "entity_ids" AS "entity_ids_0_1_0"
          ON "entity_ids_0_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id"
         AND "entity_ids_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
        WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)),
        "limited" AS (SELECT *
        FROM "roots"
        ORDER BY "created_at_transaction_time" DESC NULLS LAST, "entity_uuid" ASC
        LIMIT 10)
        SELECT DISTINCT ON("limited"."created_at_transaction_time", "limited"."entity_uuid") "limited"."created_at_transaction_time", "limited"."entity_uuid", "entity_editions_0_1_0"."properties"
        FROM "limited"
        INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
          ON "entity_editions_0_1_0"."entity_edition_id" = "limited"."entity_edition_id"
        ORDER BY "limited"."created_at_transaction_time" DESC NULLS LAST, "limited"."entity_uuid" ASC
        LIMIT 10
        "#,
        &[&pinned_timestamp, &temporal_axes.variable_interval()],
    );
}

#[test]
fn fetch_keys_then_hydrate_with_cursor() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);

    let uuid = Uuid::nil();
    let parameter = compiler.add_parameter(&uuid);
    compiler
        .add_cursor_selection(
            &EntityQueryPath::Uuid,
            core::convert::identity,
            Some(parameter),
            Ordering::Ascending,
            None,
        )
        .expect("the cursor selection should compile");
    compiler.add_selection_path(&EntityQueryPath::Properties(None));
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);

    // The keyset continuation belongs to the key query, so pages after the first stay fenced.
    test_compilation(
        &compiler,
        r#"
        WITH "roots" AS MATERIALIZED (SELECT "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."entity_edition_id"
        FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
        WHERE ("entity_temporal_metadata_0_0_0"."transaction_time" @> $2::TIMESTAMPTZ)
          AND ("entity_temporal_metadata_0_0_0"."decision_time" && $3)
          AND ("entity_temporal_metadata_0_0_0"."entity_uuid" > $1)),
        "limited" AS (SELECT *
        FROM "roots"
        ORDER BY "entity_uuid" ASC
        LIMIT 10)
        SELECT DISTINCT ON("limited"."entity_uuid") "limited"."entity_uuid", "entity_editions_0_1_0"."properties"
        FROM "limited"
        INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
          ON "entity_editions_0_1_0"."entity_edition_id" = "limited"."entity_edition_id"
        ORDER BY "limited"."entity_uuid" ASC
        LIMIT 10
        "#,
        &[&uuid, &pinned_timestamp, &temporal_axes.variable_interval()],
    );
}

#[test]
fn fetch_keys_then_hydrate_carries_existing_ctes() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let pinned_timestamp = temporal_axes.pinned_timestamp();
    let mut compiler = SelectCompiler::<DataTypeWithMetadata>::new(Some(&temporal_axes), false);
    compiler.add_distinct_selection_with_ordering(
        &DataTypeQueryPath::Version,
        Distinctness::Distinct,
        Some((Ordering::Descending, None)),
    );
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
    compiler.set_limit(5);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);

    // The latest-version CTE shadows `ontology_ids` and has to stay ahead of the fence CTEs.
    test_compilation(
        &compiler,
        r#"
        WITH "ontology_ids" AS (SELECT *, MAX("ontology_ids_0_0_0"."version") OVER (PARTITION BY "ontology_ids_0_0_0"."base_url") AS "latest_version"
        FROM "ontology_ids" AS "ontology_ids_0_0_0"),
        "roots" AS MATERIALIZED (SELECT "ontology_ids_0_1_0"."version"
        FROM "ontology_temporal_metadata" AS "ontology_temporal_metadata_0_0_0"
        INNER JOIN "ontology_ids" AS "ontology_ids_0_1_0"
          ON "ontology_ids_0_1_0"."ontology_id" = "ontology_temporal_metadata_0_0_0"."ontology_id"
        WHERE ("ontology_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
          AND ("ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version")),
        "limited" AS (SELECT *
        FROM "roots"
        ORDER BY "version" DESC
        LIMIT 5)
        SELECT DISTINCT ON("limited"."version") "limited"."version"
        FROM "limited"
        ORDER BY "limited"."version" DESC
        LIMIT 5
        "#,
        &[&pinned_timestamp],
    );
}

// No query path compiles to a right outer join today: `ReferenceTable::target_relation` is the
// only source of one, and every chain reaching it passes an outer join first, which converts all
// later hops to left outer joins. Both tests below therefore plant the join type by hand — the
// guard is a fence against that structure changing.

#[test]
fn fetch_keys_then_hydrate_generating_hydration_join_falls_back() {
    use super::CompiledJoin;
    use crate::store::postgres::query::{Alias, JoinType, Table};

    let mut compiler = SelectCompiler::<Entity>::new(None, true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);

    // Nothing references the join, so it would land in the hydration statement.
    compiler.artifacts.joins.push(CompiledJoin {
        table: Table::EntityEditions,
        alias: Alias {
            condition_index: 0,
            chain_depth: 1,
            number: 0,
        },
        join_type: JoinType::RightOuter,
        conditions: Vec::new(),
        to_many: false,
    });

    assert_eq!(
        compiler.fetch_keys_then_hydrate_statement(None).map(|_| ()),
        Err(ShapeFallback::GeneratingJoin)
    );
}

#[test]
fn fetch_keys_then_hydrate_generating_key_join_falls_back() {
    use crate::store::postgres::query::JoinType;

    let mut compiler = SelectCompiler::<Entity>::new(None, true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );

    // The filter puts the `entity_editions` join into the key query's share.
    let json_path = JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Borrowed(
        r#"$."https://blockprotocol.org/@alice/types/property-type/name/""#,
    ))]);
    let filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::Properties(Some(json_path)),
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Borrowed("Bob")),
            convert: None,
        },
    );
    compiler.add_filter(&filter).expect("Failed to add filter");
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);

    let join = compiler
        .artifacts
        .joins
        .first_mut()
        .expect("the property filter should have joined the editions table");
    join.join_type = JoinType::RightOuter;

    assert_eq!(
        compiler.fetch_keys_then_hydrate_statement(None).map(|_| ()),
        Err(ShapeFallback::GeneratingJoin)
    );
}

#[test]
fn fetch_keys_then_hydrate_reused_to_many_join_falls_back() {
    let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
    let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), true);
    compiler.add_distinct_selection_with_ordering(
        &EntityQueryPath::Uuid,
        Distinctness::Distinct,
        Some((Ordering::Ascending, None)),
    );

    // Both conditions share one filter index, so the second reuses the first's link join and
    // the fan-out taint has to stick to the reused join.
    let filter = Filter::All(vec![
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::Uuid),
                    direction: EdgeDirection::Incoming,
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
                    direction: EdgeDirection::Incoming,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(Uuid::nil()),
                convert: None,
            },
        ),
    ]);
    compiler.add_filter(&filter).expect("Failed to add filter");
    compiler.set_limit(10);
    compiler.set_statement_shape(StatementShape::FencedKeysFirst);

    assert_eq!(
        compiler.fetch_keys_then_hydrate_statement(None).map(|_| ()),
        Err(ShapeFallback::ToManyKeyJoin)
    );
}

#[test]
fn key_column_rewriter_disambiguates_collisions() {
    use std::collections::HashSet;

    use super::KeyColumnRewriter;
    use crate::store::postgres::query::ast::{ColumnName, TableName};

    let tables: HashSet<TableName<'static>> =
        [TableName::from("first"), TableName::from("second")].into();
    let key_columns = vec![
        (TableName::from("first"), ColumnName::from("web_id")),
        (TableName::from("second"), ColumnName::from("web_id")),
        (TableName::from("first"), ColumnName::from("entity_uuid")),
    ];
    let rewriter = KeyColumnRewriter::new(&tables, &key_columns)
        .expect("the disambiguated names should not collide");

    assert_eq!(
        rewriter
            .output(&TableName::from("first"), &ColumnName::from("web_id"))
            .as_str(),
        "first_web_id"
    );
    assert_eq!(
        rewriter
            .output(&TableName::from("second"), &ColumnName::from("web_id"))
            .as_str(),
        "second_web_id"
    );
    assert_eq!(
        rewriter
            .output(&TableName::from("first"), &ColumnName::from("entity_uuid"))
            .as_str(),
        "entity_uuid"
    );
}

#[test]
fn key_column_rewriter_rejects_colliding_output_names() {
    use std::collections::HashSet;

    use super::KeyColumnRewriter;
    use crate::store::postgres::query::ast::{ColumnName, TableName};

    let tables: HashSet<TableName<'static>> = [
        TableName::from("first"),
        TableName::from("second"),
        TableName::from("third"),
    ]
    .into();

    // `web_id` is shared, so both users get prefixed — and `first_web_id` is what the third
    // table's column is already called.
    let key_columns = vec![
        (TableName::from("first"), ColumnName::from("web_id")),
        (TableName::from("second"), ColumnName::from("web_id")),
        (TableName::from("third"), ColumnName::from("first_web_id")),
    ];

    assert_eq!(
        KeyColumnRewriter::new(&tables, &key_columns).map(|_| ()),
        Err(ShapeFallback::KeyColumnNameCollision)
    );
}

mod cursor_condition {
    use hash_graph_store::query::{NullOrdering, Ordering};

    use super::{super::CursorKey, *};
    use crate::store::postgres::query::{Alias, Expression, PostgresQueryPath as _};

    fn key(number: usize) -> Expression {
        Expression::ColumnReference(EntityQueryPath::Uuid.terminating_column().0.aliased(Alias {
            condition_index: 0,
            chain_depth: 0,
            number,
        }))
    }

    fn nullable_key(
        number: usize,
        value: Option<Expression>,
        ordering: Ordering,
        nulls: Option<NullOrdering>,
    ) -> CursorKey {
        CursorKey {
            expression: key(number),
            value,
            ordering,
            nulls,
            non_null: false,
        }
    }

    fn transpiled(cursor: &[CursorKey]) -> Option<String> {
        SelectCompiler::<Entity>::cursor_condition(cursor)
            .map(|condition| condition.transpile_to_string())
    }

    #[test]
    fn single_key_continues_past_value() {
        assert_eq!(
            transpiled(&[nullable_key(
                0,
                Some(Expression::Parameter(1)),
                Ordering::Ascending,
                Some(NullOrdering::First)
            )])
            .expect("a cursor with a value should produce a condition"),
            r#""entity_temporal_metadata_0_0_0"."entity_uuid" > $1"#
        );
        // Without a hint the ascending key inherits Postgres' nulls-last default.
        assert_eq!(
            transpiled(&[nullable_key(
                0,
                Some(Expression::Parameter(1)),
                Ordering::Ascending,
                None
            )])
            .expect("a cursor with a value should produce a condition"),
            r#"(("entity_temporal_metadata_0_0_0"."entity_uuid" > $1) OR ("entity_temporal_metadata_0_0_0"."entity_uuid" IS NULL))"#
        );
        assert_eq!(
            transpiled(&[nullable_key(
                0,
                Some(Expression::Parameter(1)),
                Ordering::Descending,
                Some(NullOrdering::First)
            )])
            .expect("a cursor with a value should produce a condition"),
            r#""entity_temporal_metadata_0_0_0"."entity_uuid" < $1"#
        );
    }

    #[test]
    fn nulls_last_also_continues_into_nulls() {
        assert_eq!(
            transpiled(&[nullable_key(
                0,
                Some(Expression::Parameter(1)),
                Ordering::Ascending,
                Some(NullOrdering::Last)
            )])
            .expect("a cursor with a value should produce a condition"),
            r#"(("entity_temporal_metadata_0_0_0"."entity_uuid" > $1) OR ("entity_temporal_metadata_0_0_0"."entity_uuid" IS NULL))"#
        );
    }

    #[test]
    fn null_cursor_value_continues_into_non_null() {
        assert_eq!(
            transpiled(&[nullable_key(
                0,
                None,
                Ordering::Ascending,
                Some(NullOrdering::First)
            )])
            .expect("a `NULL` cursor with nulls first should produce a condition"),
            r#""entity_temporal_metadata_0_0_0"."entity_uuid" IS NOT NULL"#
        );
    }

    #[test]
    fn exhausted_cursor_never_matches() {
        // A `NULL` cursor value with nulls sorted last has no rows after it, so the whole
        // continuation must be `FALSE` — an absent condition would replay the first page.
        assert_eq!(
            transpiled(&[nullable_key(
                0,
                None,
                Ordering::Ascending,
                Some(NullOrdering::Last)
            )])
            .expect("an exhausted cursor should produce a never-matching condition"),
            "FALSE"
        );
        // The unhinted ascending key defaults to nulls-last and exhausts the same way.
        assert_eq!(
            transpiled(&[nullable_key(0, None, Ordering::Ascending, None)])
                .expect("an exhausted cursor should produce a never-matching condition"),
            "FALSE"
        );
        // Multiple keys exhaust only when every alternative drops.
        assert_eq!(
            transpiled(&[
                nullable_key(0, None, Ordering::Ascending, Some(NullOrdering::Last)),
                nullable_key(1, None, Ordering::Descending, Some(NullOrdering::Last)),
            ])
            .expect("an exhausted cursor should produce a never-matching condition"),
            "FALSE"
        );
    }

    #[test]
    fn null_prefix_key_requires_null_equality() {
        assert_eq!(
            transpiled(&[
                nullable_key(0, None, Ordering::Ascending, Some(NullOrdering::First)),
                nullable_key(
                    1,
                    Some(Expression::Parameter(1)),
                    Ordering::Ascending,
                    Some(NullOrdering::First)
                ),
            ])
            .expect("a two-key cursor should produce a condition"),
            r#"((("entity_temporal_metadata_0_0_0"."entity_uuid" IS NULL) AND ("entity_temporal_metadata_0_0_1"."entity_uuid" > $1)) OR ("entity_temporal_metadata_0_0_0"."entity_uuid" IS NOT NULL))"#
        );
    }

    #[test]
    fn null_cursor_with_nulls_last_drops_only_its_alternative() {
        assert_eq!(
            transpiled(&[
                nullable_key(
                    0,
                    Some(Expression::Parameter(1)),
                    Ordering::Ascending,
                    Some(NullOrdering::First)
                ),
                nullable_key(1, None, Ordering::Ascending, Some(NullOrdering::Last)),
            ])
            .expect("the first key should still produce an alternative"),
            r#""entity_temporal_metadata_0_0_0"."entity_uuid" > $1"#
        );
    }

    #[test]
    fn non_null_key_needs_no_null_handling() {
        assert_eq!(
            transpiled(&[CursorKey {
                expression: key(0),
                value: Some(Expression::Parameter(1)),
                ordering: Ordering::Ascending,
                nulls: None,
                non_null: true,
            }])
            .expect("a cursor with a value should produce a condition"),
            r#""entity_temporal_metadata_0_0_0"."entity_uuid" > $1"#
        );
    }

    #[test]
    fn later_keys_require_equality_on_earlier_keys() {
        assert_eq!(
            transpiled(&[
                nullable_key(
                    0,
                    Some(Expression::Parameter(1)),
                    Ordering::Ascending,
                    Some(NullOrdering::First)
                ),
                nullable_key(
                    1,
                    Some(Expression::Parameter(2)),
                    Ordering::Descending,
                    None
                ),
            ])
            .expect("a two-key cursor should produce a condition"),
            r#"((("entity_temporal_metadata_0_0_0"."entity_uuid" = $1) AND ("entity_temporal_metadata_0_0_1"."entity_uuid" < $2)) OR ("entity_temporal_metadata_0_0_0"."entity_uuid" > $1))"#
        );
    }
}
