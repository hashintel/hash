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
    use type_system::DataType;

    use crate::{
        ontology::DataTypeQueryPath,
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
    fn asterix() {
        test_compilation(
            &SelectCompiler::<DataType>::with_asterix(),
            r#"SELECT * FROM "data_types""#,
            &[],
        );
    }

    #[test]
    fn default_fields() {
        test_compilation(
            &SelectCompiler::<DataType>::with_default_fields(),
            r#"
            SELECT "data_types"."schema", "data_types"."owned_by_id"
            FROM "data_types"
            "#,
            &[],
        );
    }

    #[test]
    fn simple_expression() {
        let mut compiler = SelectCompiler::<DataType>::with_asterix();
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
        let mut compiler = SelectCompiler::<DataType>::with_asterix();

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
        let mut compiler = SelectCompiler::<DataType>::with_asterix();

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
        let mut compiler = SelectCompiler::<DataType>::with_asterix();

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
}
