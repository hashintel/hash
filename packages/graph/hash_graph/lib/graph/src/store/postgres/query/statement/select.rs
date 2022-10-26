use std::fmt::{self, Write};

use crate::store::postgres::query::{
    JoinExpression, SelectExpression, Table, Transpile, WhereExpression, WithExpression,
};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct SelectStatement<'q> {
    pub with: WithExpression<'q>,
    pub distinct: bool,
    pub selects: Vec<SelectExpression<'q>>,
    pub from: Table,
    pub joins: Vec<JoinExpression<'q>>,
    pub where_expression: WhereExpression<'q>,
}

impl Transpile for SelectStatement<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if !self.with.is_empty() {
            self.with.transpile(fmt)?;
            fmt.write_char('\n')?;
        }

        fmt.write_str("SELECT ")?;

        if self.distinct {
            fmt.write_str("DISTINCT ")?;
        }

        for (idx, condition) in self.selects.iter().enumerate() {
            condition.transpile(fmt)?;
            if idx + 1 < self.selects.len() {
                fmt.write_str(", ")?;
            }
        }
        fmt.write_str("\nFROM ")?;
        self.from.transpile(fmt)?;

        for join in &self.joins {
            fmt.write_char('\n')?;
            join.transpile(fmt)?;
        }

        if !self.where_expression.is_empty() {
            fmt.write_char('\n')?;
            self.where_expression.transpile(fmt)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use postgres_types::ToSql;
    use type_system::{DataType, EntityType, PropertyType};

    use crate::{
        ontology::{
            DataTypeQueryPath, EntityTypeQueryPath, LinkTypeQueryPath, PropertyTypeQueryPath,
        },
        store::{
            postgres::query::{test_helper::trim_whitespace, PostgresQueryRecord, SelectCompiler},
            query::{Filter, FilterExpression, Parameter},
        },
    };

    fn test_compilation<'f: 'q, 'q, T: PostgresQueryRecord<'q>>(
        compiler: &SelectCompiler<'f, 'q, T>,
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
        test_compilation(
            &SelectCompiler::<DataType>::with_asterisk(),
            r#"SELECT * FROM "data_types""#,
            &[],
        );
    }

    #[test]
    fn default_selection() {
        test_compilation(
            &SelectCompiler::<DataType>::with_default_selection(),
            r#"
            SELECT
                "data_types"."schema"->>'$id',
                "data_types"."schema",
                "data_types"."owned_by_id",
                "data_types"."created_by_id",
                "data_types"."updated_by_id",
                "data_types"."removed_by_id"
            FROM "data_types"
            "#,
            &[],
        );
    }

    #[test]
    fn simple_expression() {
        let mut compiler = SelectCompiler::<DataType>::with_asterisk();
        compiler.add_filter(&Filter::Equal(
            Some(FilterExpression::Path(DataTypeQueryPath::VersionedUri)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            )))),
        ));
        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "data_types"
            WHERE "data_types"."schema"->>'$id' = $1
            "#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );
    }

    #[test]
    fn specific_version() {
        let mut compiler = SelectCompiler::<DataType>::with_asterisk();

        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::BaseUri)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Version)),
                Some(FilterExpression::Parameter(Parameter::Number(1.0))),
            ),
        ]);
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "data_types"
            JOIN "type_ids" AS "type_ids_0_0"
              ON "type_ids_0_0"."version_id" = "data_types"."version_id"
            WHERE ("type_ids_0_0"."base_uri" = $1) AND ("type_ids_0_0"."version" = $2)
            "#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1.0,
            ],
        );
    }

    #[test]
    fn latest_version() {
        let mut compiler = SelectCompiler::<DataType>::with_asterisk();

        compiler.add_filter(&Filter::Equal(
            Some(FilterExpression::Path(DataTypeQueryPath::Version)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "latest",
            )))),
        ));

        test_compilation(
            &compiler,
            r#"
            WITH "type_ids" AS (SELECT *, MAX("type_ids"."version") OVER (PARTITION BY "type_ids"."base_uri") AS "latest_version" FROM "type_ids")
            SELECT DISTINCT *
            FROM "data_types"
            JOIN "type_ids" AS "type_ids_0_0"
              ON "type_ids_0_0"."version_id" = "data_types"."version_id"
            WHERE "type_ids_0_0"."version" = "type_ids_0_0"."latest_version"
            "#,
            &[],
        );
    }

    #[test]
    fn not_latest_version() {
        let mut compiler = SelectCompiler::<DataType>::with_asterisk();

        compiler.add_filter(&Filter::NotEqual(
            Some(FilterExpression::Path(DataTypeQueryPath::Version)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "latest",
            )))),
        ));

        test_compilation(
            &compiler,
            r#"
            WITH "type_ids" AS (SELECT *, MAX("type_ids"."version") OVER (PARTITION BY "type_ids"."base_uri") AS "latest_version" FROM "type_ids")
            SELECT DISTINCT *
            FROM "data_types"
            JOIN "type_ids" AS "type_ids_0_0"
              ON "type_ids_0_0"."version_id" = "data_types"."version_id"
            WHERE "type_ids_0_0"."version" != "type_ids_0_0"."latest_version"
            "#,
            &[],
        );
    }

    #[test]
    fn property_type_by_referenced_data_types() {
        let mut compiler = SelectCompiler::<PropertyType>::with_asterisk();

        compiler.add_filter(&Filter::Equal(
            Some(FilterExpression::Path(PropertyTypeQueryPath::DataTypes(
                DataTypeQueryPath::Title,
            ))),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Text",
            )))),
        ));

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "property_types"
            JOIN "property_type_data_type_references" AS "property_type_data_type_references_0_0"
              ON "property_type_data_type_references_0_0"."source_property_type_version_id" = "property_types"."version_id"
            JOIN "data_types" AS "data_types_0_1" ON "data_types_0_1"."version_id" = "property_type_data_type_references_0_0"."target_data_type_version_id"
            WHERE "data_types_0_1"."schema"->>'title' = $1
            "#,
            &[&"Text"],
        );

        let filter = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(PropertyTypeQueryPath::DataTypes(
                    DataTypeQueryPath::BaseUri,
                ))),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(PropertyTypeQueryPath::DataTypes(
                    DataTypeQueryPath::Version,
                ))),
                Some(FilterExpression::Parameter(Parameter::Number(1.0))),
            ),
        ]);
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "property_types"
            JOIN "property_type_data_type_references" AS "property_type_data_type_references_0_0"
              ON "property_type_data_type_references_0_0"."source_property_type_version_id" = "property_types"."version_id"
            JOIN "data_types" AS "data_types_0_1" ON "data_types_0_1"."version_id" = "property_type_data_type_references_0_0"."target_data_type_version_id"
            JOIN "property_type_data_type_references" AS "property_type_data_type_references_1_0"
              ON "property_type_data_type_references_1_0"."source_property_type_version_id" = "property_types"."version_id"
            JOIN "type_ids" AS "type_ids_1_1"
              ON "type_ids_1_1"."version_id" = "property_type_data_type_references_1_0"."target_data_type_version_id"
            WHERE "data_types_0_1"."schema"->>'title' = $1
              AND ("type_ids_1_1"."base_uri" = $2) AND ("type_ids_1_1"."version" = $3)
            "#,
            &[
                &"Text",
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1.0,
            ],
        );
    }

    #[test]
    fn property_type_by_referenced_property_types() {
        let mut compiler = SelectCompiler::<PropertyType>::with_asterisk();

        let filter = Filter::Equal(
            Some(FilterExpression::Path(
                PropertyTypeQueryPath::PropertyTypes(Box::new(PropertyTypeQueryPath::Title)),
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
            FROM "property_types"
            JOIN "property_type_property_type_references" AS "property_type_property_type_references_0_0"
              ON "property_type_property_type_references_0_0"."source_property_type_version_id" = "property_types"."version_id"
            JOIN "property_types" AS "property_types_0_1" ON "property_types_0_1"."version_id" = "property_type_property_type_references_0_0"."target_property_type_version_id"
            WHERE "property_types_0_1"."schema"->>'title' = $1
            "#,
            &[&"Text"],
        );
    }

    #[test]
    fn entity_type_by_referenced_property_types() {
        let mut compiler = SelectCompiler::<EntityType>::with_asterisk();

        let filter = Filter::Equal(
            Some(FilterExpression::Path(EntityTypeQueryPath::Properties(
                PropertyTypeQueryPath::Title,
            ))),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Name",
            )))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_types"
            JOIN "entity_type_property_type_references" AS "entity_type_property_type_references_0_0"
              ON "entity_type_property_type_references_0_0"."source_entity_type_version_id" = "entity_types"."version_id"
            JOIN "property_types" AS "property_types_0_1"
              ON "property_types_0_1"."version_id" = "entity_type_property_type_references_0_0"."target_property_type_version_id"
            WHERE "property_types_0_1"."schema"->>'title' = $1
            "#,
            &[&"Name"],
        );
    }

    #[test]
    fn entity_type_by_referenced_link_types() {
        let mut compiler = SelectCompiler::<EntityType>::with_asterisk();

        let filter = Filter::Equal(
            Some(FilterExpression::Path(EntityTypeQueryPath::Links(
                LinkTypeQueryPath::Title,
            ))),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "Friend Of",
            )))),
        );
        compiler.add_filter(&filter);

        test_compilation(
            &compiler,
            r#"
            SELECT *
            FROM "entity_types"
            JOIN "entity_type_link_type_references" AS "entity_type_link_type_references_0_0"
              ON "entity_type_link_type_references_0_0"."source_entity_type_version_id" = "entity_types"."version_id"
            JOIN "link_types" AS "link_types_0_1"
              ON "link_types_0_1"."version_id" = "entity_type_link_type_references_0_0"."target_link_type_version_id"
            WHERE "link_types_0_1"."schema"->>'title' = $1
            "#,
            &[&"Friend Of"],
        );
    }
}
