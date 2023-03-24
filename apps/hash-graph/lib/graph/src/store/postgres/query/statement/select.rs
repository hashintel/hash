use std::fmt::{self, Write};

use crate::store::postgres::query::{
    expression::OrderByExpression, AliasedColumn, AliasedTable, JoinExpression, SelectExpression,
    Transpile, WhereExpression, WithExpression,
};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct SelectStatement<'p> {
    pub with: WithExpression<'p>,
    pub distinct: Vec<AliasedColumn<'p>>,
    pub selects: Vec<SelectExpression<'p>>,
    pub from: AliasedTable,
    pub joins: Vec<JoinExpression<'p>>,
    pub where_expression: WhereExpression<'p>,
    pub order_by_expression: OrderByExpression<'p>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Distinctness {
    Indistinct,
    Distinct,
}

impl Transpile for SelectStatement<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if !self.with.is_empty() {
            self.with.transpile(fmt)?;
            fmt.write_char('\n')?;
        }

        fmt.write_str("SELECT ")?;

        if !self.distinct.is_empty() {
            fmt.write_str("DISTINCT ON(")?;

            for (idx, column) in self.distinct.iter().enumerate() {
                if idx > 0 {
                    fmt.write_str(", ")?;
                }
                column.transpile(fmt)?;
            }
            fmt.write_str(") ")?;
        }

        for (idx, condition) in self.selects.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            condition.transpile(fmt)?;
        }
        fmt.write_str("\nFROM ")?;
        self.from.table.transpile(fmt)?;
        fmt.write_str(" AS ")?;
        self.from.transpile(fmt)?;

        for join in &self.joins {
            fmt.write_char('\n')?;
            join.transpile(fmt)?;
        }

        if !self.where_expression.is_empty() {
            fmt.write_char('\n')?;
            self.where_expression.transpile(fmt)?;
        }

        if !self.order_by_expression.is_empty() {
            fmt.write_char('\n')?;
            self.order_by_expression.transpile(fmt)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use postgres_types::ToSql;
    use uuid::Uuid;

    use crate::{
        knowledge::{Entity, EntityQueryPath},
        ontology::{
            DataTypeQueryPath, DataTypeWithMetadata, EntityTypeQueryPath, EntityTypeWithMetadata,
            PropertyTypeQueryPath, PropertyTypeWithMetadata,
        },
        store::{
            postgres::query::{
                test_helper::trim_whitespace, Distinctness, Ordering, PostgresRecord,
                SelectCompiler,
            },
            query::{Filter, FilterExpression, JsonPath, Parameter, PathToken},
        },
        subgraph::{
            edges::{EdgeDirection, KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind},
            temporal_axes::QueryTemporalAxesUnresolved,
        },
    };

    fn test_compilation<'f, 'p: 'f, T: PostgresRecord + 'static>(
        compiler: &SelectCompiler<'f, 'p, T>,
        expected_statement: &'static str,
        expected_parameters: &[&'f dyn ToSql],
    ) {
        let (compiled_statement, compiled_parameters) = compiler.compile();

        assert_eq!(
            trim_whitespace(compiled_statement),
            trim_whitespace(expected_statement)
        );

        let compiled_parameters = compiled_parameters
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();
        let expected_parameters = expected_parameters
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();

        assert_eq!(compiled_parameters, expected_parameters);
    }

    #[test]
    fn asterisk() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        test_compilation(
            &SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes)),
            r#"SELECT * FROM "data_types" AS "data_types_0_0_0""#,
            &[],
        );
    }

    #[test]
    fn simple_expression() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler =
            SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes));
        compiler.add_filter(&Filter::Equal(
            Some(FilterExpression::Path(DataTypeQueryPath::VersionedUrl)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            )))),
        ));
        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "data_types" AS "data_types_0_0_0"
            WHERE "data_types_0_0_0"."schema"->>'$id' = $1
            "#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );
    }

    #[test]
    fn specific_version() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler =
            SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::BaseUrl)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Version)),
                Some(FilterExpression::Parameter(Parameter::Number(1))),
            ),
        ]);
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "data_types" AS "data_types_0_0_0"
            INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_1_0"
              ON "ontology_id_with_metadata_0_1_0"."ontology_id" = "data_types_0_0_0"."ontology_id"
            WHERE ("ontology_id_with_metadata_0_1_0"."base_url" = $1) AND ("ontology_id_with_metadata_0_1_0"."version" = $2)
            "#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1,
            ],
        );
    }

    #[test]
    fn latest_version() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler =
            SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

        compiler.add_filter(&Filter::Equal(
            Some(FilterExpression::Path(DataTypeQueryPath::Version)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "latest",
            )))),
        ));

        test_compilation(
            &compiler,
            r#"
            WITH "ontology_id_with_metadata" AS (SELECT *, MAX("ontology_id_with_metadata_0_0_0"."version") OVER (PARTITION BY "ontology_id_with_metadata_0_0_0"."base_url") AS "latest_version" FROM "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_0_0")
            SELECT *
            FROM "data_types" AS "data_types_0_0_0"
            INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_1_0"
              ON "ontology_id_with_metadata_0_1_0"."ontology_id" = "data_types_0_0_0"."ontology_id"
            WHERE "ontology_id_with_metadata_0_1_0"."version" = "ontology_id_with_metadata_0_1_0"."latest_version"
            "#,
            &[],
        );
    }

    #[test]
    fn not_latest_version() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler =
            SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

        compiler.add_filter(&Filter::NotEqual(
            Some(FilterExpression::Path(DataTypeQueryPath::Version)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "latest",
            )))),
        ));

        test_compilation(
            &compiler,
            r#"
            WITH "ontology_id_with_metadata" AS (SELECT *, MAX("ontology_id_with_metadata_0_0_0"."version") OVER (PARTITION BY "ontology_id_with_metadata_0_0_0"."base_url") AS "latest_version" FROM "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_0_0")
            SELECT *
            FROM "data_types" AS "data_types_0_0_0"
            INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_1_0"
              ON "ontology_id_with_metadata_0_1_0"."ontology_id" = "data_types_0_0_0"."ontology_id"
            WHERE "ontology_id_with_metadata_0_1_0"."version" != "ontology_id_with_metadata_0_1_0"."latest_version"
            "#,
            &[],
        );
    }

    #[test]
    fn property_type_by_referenced_data_types() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler =
            SelectCompiler::<PropertyTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

        compiler.add_filter(&Filter::Equal(
            Some(FilterExpression::Path(
                PropertyTypeQueryPath::DataTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                    path: DataTypeQueryPath::Title,
                },
            )),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Text",
            )))),
        ));

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "property_types" AS "property_types_0_0_0"
            INNER JOIN "property_type_constrains_values_on" AS "property_type_constrains_values_on_0_1_0"
              ON "property_type_constrains_values_on_0_1_0"."source_property_type_ontology_id" = "property_types_0_0_0"."ontology_id"
            INNER JOIN "data_types" AS "data_types_0_2_0"
              ON "data_types_0_2_0"."ontology_id" = "property_type_constrains_values_on_0_1_0"."target_data_type_ontology_id"
            WHERE "data_types_0_2_0"."schema"->>'title' = $1
            "#,
            &[&"Text"],
        );

        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(
                    PropertyTypeQueryPath::DataTypeEdge {
                        edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                        path: DataTypeQueryPath::BaseUrl,
                    },
                )),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(
                    PropertyTypeQueryPath::DataTypeEdge {
                        edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                        path: DataTypeQueryPath::Version,
                    },
                )),
                Some(FilterExpression::Parameter(Parameter::Number(1))),
            ),
        ]);
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT * FROM "property_types" AS "property_types_0_0_0"
            INNER JOIN "property_type_constrains_values_on" AS "property_type_constrains_values_on_0_1_0"
              ON "property_type_constrains_values_on_0_1_0"."source_property_type_ontology_id" = "property_types_0_0_0"."ontology_id"
            INNER JOIN "data_types" AS "data_types_0_2_0"
              ON "data_types_0_2_0"."ontology_id" = "property_type_constrains_values_on_0_1_0"."target_data_type_ontology_id"
            INNER JOIN "property_type_constrains_values_on" AS "property_type_constrains_values_on_1_1_0"
              ON "property_type_constrains_values_on_1_1_0"."source_property_type_ontology_id" = "property_types_0_0_0"."ontology_id"
            INNER JOIN "data_types" AS "data_types_1_2_0"
              ON "data_types_1_2_0"."ontology_id" = "property_type_constrains_values_on_1_1_0"."target_data_type_ontology_id"
            INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_1_3_0"
              ON "ontology_id_with_metadata_1_3_0"."ontology_id" = "data_types_1_2_0"."ontology_id"
            WHERE "data_types_0_2_0"."schema"->>'title' = $1
              AND ("ontology_id_with_metadata_1_3_0"."base_url" = $2)
              AND ("ontology_id_with_metadata_1_3_0"."version" = $3)
            "#,
            &[
                &"Text",
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1,
            ],
        );
    }

    #[test]
    fn property_type_by_referenced_property_types() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler =
            SelectCompiler::<PropertyTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::Equal(
            Some(FilterExpression::Path(
                PropertyTypeQueryPath::PropertyTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                    path: Box::new(PropertyTypeQueryPath::Title),
                    direction: EdgeDirection::Outgoing,
                },
            )),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Text",
            )))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "property_types" AS "property_types_0_0_0"
            INNER JOIN "property_type_constrains_properties_on" AS "property_type_constrains_properties_on_0_1_0"
              ON "property_type_constrains_properties_on_0_1_0"."source_property_type_ontology_id" = "property_types_0_0_0"."ontology_id"
            INNER JOIN "property_types" AS "property_types_0_2_0"
              ON "property_types_0_2_0"."ontology_id" = "property_type_constrains_properties_on_0_1_0"."target_property_type_ontology_id"
            WHERE "property_types_0_2_0"."schema"->>'title' = $1
            "#,
            &[&"Text"],
        );
    }

    #[test]
    fn entity_type_by_referenced_property_types() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler =
            SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::Equal(
            Some(FilterExpression::Path(
                EntityTypeQueryPath::PropertyTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                    path: PropertyTypeQueryPath::Title,
                },
            )),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Name",
            )))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_types" AS "entity_types_0_0_0"
            INNER JOIN "entity_type_constrains_properties_on" AS "entity_type_constrains_properties_on_0_1_0"
              ON "entity_type_constrains_properties_on_0_1_0"."source_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
            INNER JOIN "property_types" AS "property_types_0_2_0"
              ON "property_types_0_2_0"."ontology_id" = "entity_type_constrains_properties_on_0_1_0"."target_property_type_ontology_id"
            WHERE "property_types_0_2_0"."schema"->>'title' = $1
            "#,
            &[&"Name"],
        );
    }

    #[test]
    fn entity_type_by_referenced_link_types() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler =
            SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::Equal(
            Some(FilterExpression::Path(
                EntityTypeQueryPath::EntityTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                    path: Box::new(EntityTypeQueryPath::EntityTypeEdge {
                        edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                        path: Box::new(EntityTypeQueryPath::Title),
                        direction: EdgeDirection::Outgoing,
                    }),
                    direction: EdgeDirection::Outgoing,
                },
            )),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Friend Of",
            )))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_types" AS "entity_types_0_0_0"
            INNER JOIN "entity_type_constrains_links_on" AS "entity_type_constrains_links_on_0_1_0"
              ON "entity_type_constrains_links_on_0_1_0"."source_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
            INNER JOIN "entity_types" AS "entity_types_0_2_0"
              ON "entity_types_0_2_0"."ontology_id" = "entity_type_constrains_links_on_0_1_0"."target_entity_type_ontology_id"
            INNER JOIN "entity_type_constrains_links_on" AS "entity_type_constrains_links_on_0_3_0"
              ON "entity_type_constrains_links_on_0_3_0"."source_entity_type_ontology_id" = "entity_types_0_2_0"."ontology_id"
            INNER JOIN "entity_types" AS "entity_types_0_4_0"
              ON "entity_types_0_4_0"."ontology_id" = "entity_type_constrains_links_on_0_3_0"."target_entity_type_ontology_id"
            WHERE "entity_types_0_4_0"."schema"->>'title' = $1
            "#,
            &[&"Friend Of"],
        );
    }

    #[test]
    fn entity_type_by_inheritance() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler =
            SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::Equal(
            Some(FilterExpression::Path(
                EntityTypeQueryPath::EntityTypeEdge {
                    edge_kind: OntologyEdgeKind::InheritsFrom,
                    path: Box::new(EntityTypeQueryPath::BaseUrl),
                    direction: EdgeDirection::Outgoing,
                },
            )),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "https://blockprotocol.org/@blockprotocol/types/entity-type/link/",
            )))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_types" AS "entity_types_0_0_0"
            INNER JOIN "entity_type_inherits_from" AS "entity_type_inherits_from_0_1_0"
              ON "entity_type_inherits_from_0_1_0"."source_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
            INNER JOIN "entity_types" AS "entity_types_0_2_0"
              ON "entity_types_0_2_0"."ontology_id" = "entity_type_inherits_from_0_1_0"."target_entity_type_ontology_id"
            INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
              ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "entity_types_0_2_0"."ontology_id"
            WHERE "ontology_id_with_metadata_0_3_0"."base_url" = $1
            "#,
            &[&"https://blockprotocol.org/@blockprotocol/types/entity-type/link/"],
        );
    }

    #[test]
    fn entity_simple_query() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::Equal(
            Some(FilterExpression::Path(EntityQueryPath::Uuid)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "12345678-ABCD-4321-5678-ABCD5555DCBA",
            )))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
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
    fn entity_with_manual_selection() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes));
        compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::Uuid,
            Distinctness::Distinct,
            Some(Ordering::Ascending),
        );
        compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::DecisionTime,
            Distinctness::Distinct,
            Some(Ordering::Descending),
        );
        compiler.add_selection_path(&EntityQueryPath::Properties(None));

        let filter = Filter::Equal(
            Some(FilterExpression::Path(EntityQueryPath::RecordCreatedById)),
            Some(FilterExpression::Parameter(Parameter::Uuid(Uuid::nil()))),
        );
        compiler.add_filter(&filter);

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
              AND "entity_editions_0_1_0"."record_created_by_id" = $3
            ORDER BY "entity_temporal_metadata_0_0_0"."entity_uuid" ASC,
                     "entity_temporal_metadata_0_0_0"."decision_time" DESC
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
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));
        let json_path = JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Borrowed(
            r#"$."https://blockprotocol.org/@alice/types/property-type/name/""#,
        ))]);

        let filter = Filter::Equal(
            Some(FilterExpression::Path(EntityQueryPath::Properties(Some(
                json_path.clone(),
            )))),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Bob",
            )))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
              ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
            WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $2::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_0_0"."decision_time" && $3
              AND jsonb_path_query_first("entity_editions_0_1_0"."properties", $1::text::jsonpath) = $4
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
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));
        let json_path = JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Borrowed(
            r#"$."https://blockprotocol.org/@alice/types/property-type/name/""#,
        ))]);

        let filter = Filter::Equal(
            Some(FilterExpression::Path(EntityQueryPath::Properties(Some(
                json_path.clone(),
            )))),
            None,
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            INNER JOIN "entity_editions" AS "entity_editions_0_1_0"
              ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
            WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $2::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_0_0"."decision_time" && $3
              AND jsonb_path_query_first("entity_editions_0_1_0"."properties", $1::text::jsonpath) IS NULL
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
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::Equal(
            Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                    path: Box::new(EntityQueryPath::EditionId),
                    direction: EdgeDirection::Outgoing,
                }),
                direction: EdgeDirection::Incoming,
            })),
            Some(FilterExpression::Parameter(Parameter::Number(10))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_1_0"
              ON "entity_has_left_entity_0_1_0"."left_owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
             AND "entity_has_left_entity_0_1_0"."left_entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
            RIGHT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
              ON "entity_temporal_metadata_0_2_0"."owned_by_id" = "entity_has_left_entity_0_1_0"."owned_by_id"
             AND "entity_temporal_metadata_0_2_0"."entity_uuid" = "entity_has_left_entity_0_1_0"."entity_uuid"
            LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_3_0"
              ON "entity_has_right_entity_0_3_0"."owned_by_id" = "entity_temporal_metadata_0_2_0"."owned_by_id"
             AND "entity_has_right_entity_0_3_0"."entity_uuid" = "entity_temporal_metadata_0_2_0"."entity_uuid"
            RIGHT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_4_0"
              ON "entity_temporal_metadata_0_4_0"."owned_by_id" = "entity_has_right_entity_0_3_0"."right_owned_by_id"
             AND "entity_temporal_metadata_0_4_0"."entity_uuid" = "entity_has_right_entity_0_3_0"."right_entity_uuid"
            WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
              AND "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
              AND "entity_temporal_metadata_0_4_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_4_0"."decision_time" && $2
              AND "entity_temporal_metadata_0_4_0"."entity_edition_id" = $3
            "#,
            &[&pinned_timestamp, &temporal_axes.variable_interval(), &10],
        );
    }

    #[test]
    fn entity_incoming_link_query() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::Equal(
            Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::EditionId),
                    direction: EdgeDirection::Outgoing,
                }),
                direction: EdgeDirection::Incoming,
            })),
            Some(FilterExpression::Parameter(Parameter::Number(10))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
              ON "entity_has_right_entity_0_1_0"."right_owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
             AND "entity_has_right_entity_0_1_0"."right_entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
            RIGHT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
              ON "entity_temporal_metadata_0_2_0"."owned_by_id" = "entity_has_right_entity_0_1_0"."owned_by_id"
             AND "entity_temporal_metadata_0_2_0"."entity_uuid" = "entity_has_right_entity_0_1_0"."entity_uuid"
            LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_3_0"
              ON "entity_has_left_entity_0_3_0"."owned_by_id" = "entity_temporal_metadata_0_2_0"."owned_by_id"
             AND "entity_has_left_entity_0_3_0"."entity_uuid" = "entity_temporal_metadata_0_2_0"."entity_uuid"
            RIGHT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_4_0"
              ON "entity_temporal_metadata_0_4_0"."owned_by_id" = "entity_has_left_entity_0_3_0"."left_owned_by_id"
             AND "entity_temporal_metadata_0_4_0"."entity_uuid" = "entity_has_left_entity_0_3_0"."left_entity_uuid"
            WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
              AND "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
              AND "entity_temporal_metadata_0_4_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_4_0"."decision_time" && $2
              AND "entity_temporal_metadata_0_4_0"."entity_edition_id" = $3
            "#,
            &[&pinned_timestamp, &temporal_axes.variable_interval(), &10],
        );
    }

    #[test]
    fn link_entity_left_right_id() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::Uuid),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Uuid(Uuid::nil()))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::OwnedById),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Uuid(Uuid::nil()))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                    path: Box::new(EntityQueryPath::Uuid),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Uuid(Uuid::nil()))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                    path: Box::new(EntityQueryPath::OwnedById),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Uuid(Uuid::nil()))),
            ),
        ]);
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_1_0"
              ON "entity_has_left_entity_0_1_0"."owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
             AND "entity_has_left_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
            LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
              ON "entity_has_right_entity_0_1_0"."owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
             AND "entity_has_right_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
            WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
              AND ("entity_has_left_entity_0_1_0"."left_entity_uuid" = $3)
              AND ("entity_has_left_entity_0_1_0"."left_owned_by_id" = $4)
              AND ("entity_has_right_entity_0_1_0"."right_entity_uuid" = $5)
              AND ("entity_has_right_entity_0_1_0"."right_owned_by_id" = $6)
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
    fn filter_left_and_right() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let pinned_timestamp = temporal_axes.pinned_timestamp();
        let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                    path: Box::new(EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::BaseUrl,
                    }),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://example.com/@example-org/types/entity-type/address",
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                    edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                    path: Box::new(EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::BaseUrl,
                    }),
                    direction: EdgeDirection::Outgoing,
                })),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://example.com/@example-org/types/entity-type/name",
                )))),
            ),
        ]);
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
            LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_1_0"
              ON "entity_has_left_entity_0_1_0"."owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
             AND "entity_has_left_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
            RIGHT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
              ON "entity_temporal_metadata_0_2_0"."owned_by_id" = "entity_has_left_entity_0_1_0"."left_owned_by_id"
             AND "entity_temporal_metadata_0_2_0"."entity_uuid" = "entity_has_left_entity_0_1_0"."left_entity_uuid"
            INNER JOIN "entity_is_of_type" AS "entity_is_of_type_0_3_0"
              ON "entity_is_of_type_0_3_0"."entity_edition_id" = "entity_temporal_metadata_0_2_0"."entity_edition_id"
            INNER JOIN "entity_types" AS "entity_types_0_4_0"
              ON "entity_types_0_4_0"."ontology_id" = "entity_is_of_type_0_3_0"."entity_type_ontology_id"
            INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_5_0"
              ON "ontology_id_with_metadata_0_5_0"."ontology_id" = "entity_types_0_4_0"."ontology_id"
            LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
              ON "entity_has_right_entity_0_1_0"."owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
             AND "entity_has_right_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
            RIGHT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_1"
              ON "entity_temporal_metadata_0_2_1"."owned_by_id" = "entity_has_right_entity_0_1_0"."right_owned_by_id"
             AND "entity_temporal_metadata_0_2_1"."entity_uuid" = "entity_has_right_entity_0_1_0"."right_entity_uuid"
            INNER JOIN "entity_is_of_type" AS "entity_is_of_type_0_3_1"
              ON "entity_is_of_type_0_3_1"."entity_edition_id" = "entity_temporal_metadata_0_2_1"."entity_edition_id"
            INNER JOIN "entity_types" AS "entity_types_0_4_1"
              ON "entity_types_0_4_1"."ontology_id" = "entity_is_of_type_0_3_1"."entity_type_ontology_id"
            INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_5_1"
              ON "ontology_id_with_metadata_0_5_1"."ontology_id" = "entity_types_0_4_1"."ontology_id"
            WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
              AND "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
              AND "entity_temporal_metadata_0_2_1"."transaction_time" @> $1::TIMESTAMPTZ
              AND "entity_temporal_metadata_0_2_1"."decision_time" && $2
              AND ("ontology_id_with_metadata_0_5_0"."base_url" = $3)
              AND ("ontology_id_with_metadata_0_5_1"."base_url" = $4)
            "#,
            &[
                &pinned_timestamp,
                &temporal_axes.variable_interval(),
                &"https://example.com/@example-org/types/entity-type/address",
                &"https://example.com/@example-org/types/entity-type/name",
            ],
        );
    }

    mod predefined {
        use type_system::url::{BaseUrl, VersionedUrl};

        use super::*;
        use crate::{
            identifier::{account::AccountId, knowledge::EntityId, ontology::OntologyTypeVersion},
            knowledge::EntityUuid,
            provenance::OwnedById,
            subgraph::identifier::{DataTypeVertexId, EntityTypeVertexId, PropertyTypeVertexId},
        };

        #[test]
        fn for_versioned_url() {
            let url = VersionedUrl {
                base_url: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                version: 1,
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter = Filter::for_versioned_url(&url);
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "data_types" AS "data_types_0_0_0"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_1_0"
                  ON "ontology_id_with_metadata_0_1_0"."ontology_id" = "data_types_0_0_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_1_0"."base_url" = $1) AND ("ontology_id_with_metadata_0_1_0"."version" = $2)
                "#,
                &[
                    &url.base_url.as_str(),
                    &OntologyTypeVersion::new(url.version),
                ],
            );
        }

        #[test]
        fn for_ontology_type_record_id() {
            let url = DataTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter = Filter::for_ontology_type_vertex_id(&url);
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "data_types" AS "data_types_0_0_0"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_1_0"
                  ON "ontology_id_with_metadata_0_1_0"."ontology_id" = "data_types_0_0_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_1_0"."base_url" = $1) AND ("ontology_id_with_metadata_0_1_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_property_type_constrains_values_on_outgoing() {
            let url = PropertyTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/property-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<DataTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<DataTypeWithMetadata>::for_ontology_edge_by_property_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsValuesOn,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "data_types" AS "data_types_0_0_0"
                INNER JOIN "property_type_constrains_values_on" AS "property_type_constrains_values_on_0_1_0"
                  ON "property_type_constrains_values_on_0_1_0"."target_data_type_ontology_id" = "data_types_0_0_0"."ontology_id"
                INNER JOIN "property_types" AS "property_types_0_2_0"
                  ON "property_types_0_2_0"."ontology_id" = "property_type_constrains_values_on_0_1_0"."source_property_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "property_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_property_type_constrains_values_on_incoming() {
            let url = DataTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<PropertyTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<PropertyTypeWithMetadata>::for_ontology_edge_by_data_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsValuesOn,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "property_types" AS "property_types_0_0_0"
                INNER JOIN "property_type_constrains_values_on" AS "property_type_constrains_values_on_0_1_0"
                  ON "property_type_constrains_values_on_0_1_0"."source_property_type_ontology_id" = "property_types_0_0_0"."ontology_id"
                INNER JOIN "data_types" AS "data_types_0_2_0"
                  ON "data_types_0_2_0"."ontology_id" = "property_type_constrains_values_on_0_1_0"."target_data_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "data_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_property_type_constrains_properties_on_outgoing() {
            let url = PropertyTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/property-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<PropertyTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<PropertyTypeWithMetadata>::for_ontology_edge_by_property_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                    EdgeDirection::Outgoing,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "property_types" AS "property_types_0_0_0"
                INNER JOIN "property_type_constrains_properties_on" AS "property_type_constrains_properties_on_0_1_0"
                  ON "property_type_constrains_properties_on_0_1_0"."source_property_type_ontology_id" = "property_types_0_0_0"."ontology_id"
                INNER JOIN "property_types" AS "property_types_0_2_0"
                  ON "property_types_0_2_0"."ontology_id" = "property_type_constrains_properties_on_0_1_0"."target_property_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "property_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_property_type_constrains_properties_on_incoming() {
            let url = PropertyTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/property-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<PropertyTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<PropertyTypeWithMetadata>::for_ontology_edge_by_property_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                    EdgeDirection::Incoming,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "property_types" AS "property_types_0_0_0"
                INNER JOIN "property_type_constrains_properties_on" AS "property_type_constrains_properties_on_0_1_0"
                  ON "property_type_constrains_properties_on_0_1_0"."target_property_type_ontology_id" = "property_types_0_0_0"."ontology_id"
                INNER JOIN "property_types" AS "property_types_0_2_0"
                  ON "property_types_0_2_0"."ontology_id" = "property_type_constrains_properties_on_0_1_0"."source_property_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "property_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_entity_type_constrains_properties_on_outgoing() {
            let url = PropertyTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/property-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_property_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_types" AS "entity_types_0_0_0"
                INNER JOIN "entity_type_constrains_properties_on" AS "entity_type_constrains_properties_on_0_1_0"
                  ON "entity_type_constrains_properties_on_0_1_0"."source_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
                INNER JOIN "property_types" AS "property_types_0_2_0"
                  ON "property_types_0_2_0"."ontology_id" = "entity_type_constrains_properties_on_0_1_0"."target_property_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "property_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_entity_type_constrains_properties_on_incoming() {
            let url = EntityTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/entity-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<PropertyTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<PropertyTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "property_types" AS "property_types_0_0_0"
                INNER JOIN "entity_type_constrains_properties_on" AS "entity_type_constrains_properties_on_0_1_0"
                  ON "entity_type_constrains_properties_on_0_1_0"."target_property_type_ontology_id" = "property_types_0_0_0"."ontology_id"
                INNER JOIN "entity_types" AS "entity_types_0_2_0"
                  ON "entity_types_0_2_0"."ontology_id" = "entity_type_constrains_properties_on_0_1_0"."source_entity_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "entity_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_entity_type_inherits_from_outgoing() {
            let url = EntityTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/entity-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                    &url,
                    OntologyEdgeKind::InheritsFrom,
                    EdgeDirection::Outgoing,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_types" AS "entity_types_0_0_0"
                INNER JOIN "entity_type_inherits_from" AS "entity_type_inherits_from_0_1_0"
                  ON "entity_type_inherits_from_0_1_0"."source_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
                INNER JOIN "entity_types" AS "entity_types_0_2_0"
                  ON "entity_types_0_2_0"."ontology_id" = "entity_type_inherits_from_0_1_0"."target_entity_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "entity_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_entity_type_inherits_from_incoming() {
            let url = EntityTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/entity-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                    &url,
                    OntologyEdgeKind::InheritsFrom,
                    EdgeDirection::Incoming,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_types" AS "entity_types_0_0_0"
                INNER JOIN "entity_type_inherits_from" AS "entity_type_inherits_from_0_1_0"
                  ON "entity_type_inherits_from_0_1_0"."target_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
                INNER JOIN "entity_types" AS "entity_types_0_2_0"
                  ON "entity_types_0_2_0"."ontology_id" = "entity_type_inherits_from_0_1_0"."source_entity_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "entity_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_entity_type_constrains_links_on_outgoing() {
            let url = EntityTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/entity-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsLinksOn,
                    EdgeDirection::Outgoing,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_types" AS "entity_types_0_0_0"
                INNER JOIN "entity_type_constrains_links_on" AS "entity_type_constrains_links_on_0_1_0"
                  ON "entity_type_constrains_links_on_0_1_0"."source_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
                INNER JOIN "entity_types" AS "entity_types_0_2_0"
                  ON "entity_types_0_2_0"."ontology_id" = "entity_type_constrains_links_on_0_1_0"."target_entity_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "entity_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_entity_type_constrains_links_on_incoming() {
            let url = EntityTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/entity-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsLinksOn,
                    EdgeDirection::Incoming,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_types" AS "entity_types_0_0_0"
                INNER JOIN "entity_type_constrains_links_on" AS "entity_type_constrains_links_on_0_1_0"
                  ON "entity_type_constrains_links_on_0_1_0"."target_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
                INNER JOIN "entity_types" AS "entity_types_0_2_0"
                  ON "entity_types_0_2_0"."ontology_id" = "entity_type_constrains_links_on_0_1_0"."source_entity_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "entity_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_entity_type_constrains_link_destinations_on_outgoing() {
            let url = EntityTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/entity-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                    EdgeDirection::Outgoing,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_types" AS "entity_types_0_0_0"
                INNER JOIN "entity_type_constrains_link_destinations_on" AS "entity_type_constrains_link_destinations_on_0_1_0"
                  ON "entity_type_constrains_link_destinations_on_0_1_0"."source_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
                INNER JOIN "entity_types" AS "entity_types_0_2_0"
                  ON "entity_types_0_2_0"."ontology_id" = "entity_type_constrains_link_destinations_on_0_1_0"."target_entity_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "entity_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_entity_type_constrains_link_destinations_on_incoming() {
            let url = EntityTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/entity-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let mut compiler =
                SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter =
                Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                    &url,
                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                    EdgeDirection::Incoming,
                );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_types" AS "entity_types_0_0_0"
                INNER JOIN "entity_type_constrains_link_destinations_on" AS "entity_type_constrains_link_destinations_on_0_1_0"
                  ON "entity_type_constrains_link_destinations_on_0_1_0"."target_entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
                INNER JOIN "entity_types" AS "entity_types_0_2_0"
                  ON "entity_types_0_2_0"."ontology_id" = "entity_type_constrains_link_destinations_on_0_1_0"."source_entity_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "entity_types_0_2_0"."ontology_id"
                WHERE ("ontology_id_with_metadata_0_3_0"."base_url" = $1)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $2)
                "#,
                &[&url.base_id.as_str(), &url.revision_id],
            );
        }

        #[test]
        fn for_entity_is_of_type_outgoing() {
            let entity_id = EntityId {
                owned_by_id: OwnedById::new(AccountId::new(Uuid::new_v4())),
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let pinned_timestamp = temporal_axes.pinned_timestamp();
            let mut compiler =
                SelectCompiler::<EntityTypeWithMetadata>::with_asterisk(Some(&temporal_axes));

            let filter = Filter::<EntityTypeWithMetadata>::for_shared_edge_by_entity_id(
                entity_id,
                SharedEdgeKind::IsOfType,
            );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_types" AS "entity_types_0_0_0"
                INNER JOIN "entity_is_of_type" AS "entity_is_of_type_0_1_0"
                  ON "entity_is_of_type_0_1_0"."entity_type_ontology_id" = "entity_types_0_0_0"."ontology_id"
                INNER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
                  ON "entity_temporal_metadata_0_2_0"."entity_edition_id" = "entity_is_of_type_0_1_0"."entity_edition_id"
                WHERE "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
                  AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
                  AND ("entity_temporal_metadata_0_2_0"."owned_by_id" = $3)
                  AND ("entity_temporal_metadata_0_2_0"."entity_uuid" = $4)
                "#,
                &[
                    &pinned_timestamp,
                    &temporal_axes.variable_interval(),
                    &entity_id.owned_by_id.as_uuid(),
                    &entity_id.entity_uuid.as_uuid(),
                ],
            );
        }

        #[test]
        fn for_entity_is_of_type_incoming() {
            let url = EntityTypeVertexId {
                base_id: BaseUrl::new(
                    "https://blockprotocol.org/@blockprotocol/types/entity-type/text/".to_owned(),
                )
                .expect("invalid base url"),
                revision_id: OntologyTypeVersion::new(1),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let pinned_timestamp = temporal_axes.pinned_timestamp();
            let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

            let filter = Filter::<Entity>::for_shared_edge_by_entity_type_vertex_id(
                &url,
                SharedEdgeKind::IsOfType,
            );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
                INNER JOIN "entity_is_of_type" AS "entity_is_of_type_0_1_0"
                  ON "entity_is_of_type_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
                INNER JOIN "entity_types" AS "entity_types_0_2_0"
                  ON "entity_types_0_2_0"."ontology_id" = "entity_is_of_type_0_1_0"."entity_type_ontology_id"
                INNER JOIN "ontology_id_with_metadata" AS "ontology_id_with_metadata_0_3_0"
                  ON "ontology_id_with_metadata_0_3_0"."ontology_id" = "entity_types_0_2_0"."ontology_id"
                WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                  AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                  AND ("ontology_id_with_metadata_0_3_0"."base_url" = $3)
                  AND ("ontology_id_with_metadata_0_3_0"."version" = $4)
                "#,
                &[
                    &pinned_timestamp,
                    &temporal_axes.variable_interval(),
                    &url.base_id.as_str(),
                    &url.revision_id,
                ],
            );
        }

        #[test]
        fn for_entity_by_entity_id() {
            let entity_id = EntityId {
                owned_by_id: OwnedById::new(AccountId::new(Uuid::new_v4())),
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let pinned_timestamp = temporal_axes.pinned_timestamp();
            let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

            let filter = Filter::for_entity_by_entity_id(entity_id);
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
                WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                  AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                  AND ("entity_temporal_metadata_0_0_0"."owned_by_id" = $3)
                  AND ("entity_temporal_metadata_0_0_0"."entity_uuid" = $4)
                "#,
                &[
                    &pinned_timestamp,
                    &temporal_axes.variable_interval(),
                    &entity_id.owned_by_id.as_uuid(),
                    &entity_id.entity_uuid.as_uuid(),
                ],
            );
        }

        #[test]
        fn for_incoming_link_by_source_entity_id() {
            let entity_id = EntityId {
                owned_by_id: OwnedById::new(AccountId::new(Uuid::new_v4())),
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let pinned_timestamp = temporal_axes.pinned_timestamp();
            let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

            let filter = Filter::for_knowledge_graph_edge_by_entity_id(
                entity_id,
                KnowledgeGraphEdgeKind::HasRightEntity,
                EdgeDirection::Outgoing,
            );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
                LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
                  ON "entity_has_right_entity_0_1_0"."owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
                 AND "entity_has_right_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
                WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                  AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                  AND ("entity_has_right_entity_0_1_0"."right_owned_by_id" = $3)
                  AND ("entity_has_right_entity_0_1_0"."right_entity_uuid" = $4)
                "#,
                &[
                    &pinned_timestamp,
                    &temporal_axes.variable_interval(),
                    &entity_id.owned_by_id.as_uuid(),
                    &entity_id.entity_uuid.as_uuid(),
                ],
            );
        }

        #[test]
        fn for_outgoing_link_by_source_entity_id() {
            let entity_id = EntityId {
                owned_by_id: OwnedById::new(AccountId::new(Uuid::new_v4())),
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let pinned_timestamp = temporal_axes.pinned_timestamp();
            let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

            let filter = Filter::for_knowledge_graph_edge_by_entity_id(
                entity_id,
                KnowledgeGraphEdgeKind::HasLeftEntity,
                EdgeDirection::Outgoing,
            );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
                LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_1_0"
                  ON "entity_has_left_entity_0_1_0"."owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
                 AND "entity_has_left_entity_0_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
                WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                  AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                  AND ("entity_has_left_entity_0_1_0"."left_owned_by_id" = $3)
                  AND ("entity_has_left_entity_0_1_0"."left_entity_uuid" = $4)
                "#,
                &[
                    &pinned_timestamp,
                    &temporal_axes.variable_interval(),
                    &entity_id.owned_by_id.as_uuid(),
                    &entity_id.entity_uuid.as_uuid(),
                ],
            );
        }

        #[test]
        fn for_left_entity_by_entity_id() {
            let entity_id = EntityId {
                owned_by_id: OwnedById::new(AccountId::new(Uuid::new_v4())),
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let pinned_timestamp = temporal_axes.pinned_timestamp();
            let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

            let filter = Filter::for_knowledge_graph_edge_by_entity_id(
                entity_id,
                KnowledgeGraphEdgeKind::HasLeftEntity,
                EdgeDirection::Incoming,
            );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
                LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_0_1_0"
                  ON "entity_has_left_entity_0_1_0"."left_owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
                 AND "entity_has_left_entity_0_1_0"."left_entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
                RIGHT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
                  ON "entity_temporal_metadata_0_2_0"."owned_by_id" = "entity_has_left_entity_0_1_0"."owned_by_id"
                 AND "entity_temporal_metadata_0_2_0"."entity_uuid" = "entity_has_left_entity_0_1_0"."entity_uuid"
                WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                  AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                  AND "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
                  AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
                  AND ("entity_temporal_metadata_0_2_0"."owned_by_id" = $3)
                  AND ("entity_temporal_metadata_0_2_0"."entity_uuid" = $4)
                "#,
                &[
                    &pinned_timestamp,
                    &temporal_axes.variable_interval(),
                    &entity_id.owned_by_id.as_uuid(),
                    &entity_id.entity_uuid.as_uuid(),
                ],
            );
        }

        #[test]
        fn for_right_entity_by_entity_id() {
            let entity_id = EntityId {
                owned_by_id: OwnedById::new(AccountId::new(Uuid::new_v4())),
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
            };

            let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
            let pinned_timestamp = temporal_axes.pinned_timestamp();
            let mut compiler = SelectCompiler::<Entity>::with_asterisk(Some(&temporal_axes));

            let filter = Filter::for_knowledge_graph_edge_by_entity_id(
                entity_id,
                KnowledgeGraphEdgeKind::HasRightEntity,
                EdgeDirection::Incoming,
            );
            compiler.add_filter(&filter);

            test_compilation(
                &compiler,
                r#"
                SELECT *
                FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
                LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_0_1_0"
                  ON "entity_has_right_entity_0_1_0"."right_owned_by_id" = "entity_temporal_metadata_0_0_0"."owned_by_id"
                 AND "entity_has_right_entity_0_1_0"."right_entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
                RIGHT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_0_2_0"
                  ON "entity_temporal_metadata_0_2_0"."owned_by_id" = "entity_has_right_entity_0_1_0"."owned_by_id"
                 AND "entity_temporal_metadata_0_2_0"."entity_uuid" = "entity_has_right_entity_0_1_0"."entity_uuid"
                WHERE "entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ
                  AND "entity_temporal_metadata_0_0_0"."decision_time" && $2
                  AND "entity_temporal_metadata_0_2_0"."transaction_time" @> $1::TIMESTAMPTZ
                  AND "entity_temporal_metadata_0_2_0"."decision_time" && $2
                  AND ("entity_temporal_metadata_0_2_0"."owned_by_id" = $3)
                  AND ("entity_temporal_metadata_0_2_0"."entity_uuid" = $4)
                "#,
                &[
                    &pinned_timestamp,
                    &temporal_axes.variable_interval(),
                    &entity_id.owned_by_id.as_uuid(),
                    &entity_id.entity_uuid.as_uuid(),
                ],
            );
        }
    }
}
