use core::fmt::{self, Write as _};

use crate::store::postgres::query::{ColumnName, NonEmptyVec, Statement, TableName, Transpile};

/// Controls whether Postgres materializes a common table expression.
///
/// A materialized CTE is computed once and acts as an optimization fence: the planner cannot
/// push conditions from the outer statement into it or inline it. Without a hint Postgres
/// decides on its own, inlining CTEs that are referenced exactly once.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Materialization {
    Materialized,
    NotMaterialized,
}

#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct CommonTableExpression {
    #[builder(into)]
    name: TableName<'static>,
    /// Output column names, renaming the columns produced by the statement.
    #[builder(default)]
    columns: Vec<ColumnName<'static>>,
    #[builder(into)]
    statement: Statement,
    materialization: Option<Materialization>,
}

impl<S> From<CommonTableExpressionBuilder<S>> for NonEmptyVec<CommonTableExpression>
where
    S: common_table_expression_builder::IsComplete,
{
    fn from(builder: CommonTableExpressionBuilder<S>) -> Self {
        Self::from(builder.build())
    }
}

impl Transpile for CommonTableExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.name.transpile(fmt)?;
        if let Some((last, columns)) = self.columns.split_last() {
            fmt.write_str(" (")?;
            for column in columns {
                column.transpile(fmt)?;
                fmt.write_str(", ")?;
            }
            last.transpile(fmt)?;
            fmt.write_char(')')?;
        }
        fmt.write_str(" AS ")?;
        match self.materialization {
            None => {}
            Some(Materialization::Materialized) => fmt.write_str("MATERIALIZED ")?,
            Some(Materialization::NotMaterialized) => fmt.write_str("NOT MATERIALIZED ")?,
        }
        fmt.write_char('(')?;
        self.statement.transpile(fmt)?;
        fmt.write_char(')')
    }
}

#[derive(Clone, Debug, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct WithClause {
    /// The `with_query` list of the clause.
    ///
    /// Accepts a single [`CommonTableExpression`] (or its complete builder) as well as a
    /// ready-made [`NonEmptyVec`]; parse a [`Vec`] beforehand via `NonEmptyVec::try_from`.
    #[builder(into)]
    common_table_expressions: NonEmptyVec<CommonTableExpression>,
}

impl WithClause {
    pub fn push(&mut self, common_table_expression: impl Into<CommonTableExpression>) {
        self.common_table_expressions
            .push(common_table_expression.into());
    }
}

impl Transpile for WithClause {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_str("WITH ")?;
        for (idx, expression) in self.common_table_expressions.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            expression.transpile(fmt)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{
        Alias, FromItem, Identifier, SelectExpression, SelectStatement, Table,
        test_helper::{max_version_expression, trim_whitespace},
    };

    fn ontology_ids_statement() -> SelectStatement {
        SelectStatement::builder()
            .selects(vec![
                SelectExpression::Asterisk(None),
                SelectExpression::Expression {
                    expression: max_version_expression(),
                    output_name: Some(Identifier::from("latest_version")),
                },
            ])
            .from(
                FromItem::table(Table::OntologyIds).alias(Table::OntologyIds.aliased_name(Alias {
                    condition_index: 0,
                    chain_depth: 0,
                    number: 0,
                })),
            )
            .build()
    }

    #[test]
    fn transpile_with_expression() {
        let mut with_clause = WithClause::builder()
            .common_table_expressions(
                CommonTableExpression::builder()
                    .name(Table::OntologyIds)
                    .statement(ontology_ids_statement()),
            )
            .build();

        assert_eq!(
            trim_whitespace(&with_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WITH "ontology_ids" AS (SELECT *, MAX("ontology_ids_0_0_0"."version") OVER (PARTITION BY "ontology_ids_0_0_0"."base_url") AS "latest_version" FROM "ontology_ids" AS "ontology_ids_0_0_0")"#
            )
        );

        with_clause.push(
            CommonTableExpression::builder()
                .name("data_types")
                .statement(
                    SelectStatement::builder()
                        .selects(vec![SelectExpression::Asterisk(None)])
                        .from(FromItem::table(Table::DataTypes).alias(
                            Table::DataTypes.aliased_name(Alias {
                                condition_index: 3,
                                chain_depth: 4,
                                number: 5,
                            }),
                        )),
                ),
        );

        assert_eq!(
            trim_whitespace(&with_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WITH "ontology_ids" AS (SELECT *, MAX("ontology_ids_0_0_0"."version") OVER (PARTITION BY "ontology_ids_0_0_0"."base_url") AS "latest_version" FROM "ontology_ids" AS "ontology_ids_0_0_0"),
                     "data_types" AS (SELECT * FROM "data_types" AS "data_types_3_4_5")"#
            )
        );
    }

    #[test]
    fn transpile_materialized_cte() {
        let with_clause = WithClause::builder()
            .common_table_expressions(
                CommonTableExpression::builder()
                    .name("roots")
                    .statement(ontology_ids_statement())
                    .materialization(Materialization::Materialized),
            )
            .build();

        assert!(
            with_clause
                .transpile_to_string()
                .starts_with(r#"WITH "roots" AS MATERIALIZED (SELECT"#)
        );

        let with_clause = WithClause::builder()
            .common_table_expressions(
                CommonTableExpression::builder()
                    .name("roots")
                    .statement(ontology_ids_statement())
                    .materialization(Materialization::NotMaterialized),
            )
            .build();

        assert!(
            with_clause
                .transpile_to_string()
                .starts_with(r#"WITH "roots" AS NOT MATERIALIZED (SELECT"#)
        );
    }

    #[test]
    fn transpile_cte_with_column_list() {
        let with_clause = WithClause::builder()
            .common_table_expressions(
                CommonTableExpression::builder()
                    .name("roots")
                    .columns(vec!["web_id".into(), "entity_uuid".into()])
                    .statement(ontology_ids_statement()),
            )
            .build();

        assert!(
            with_clause
                .transpile_to_string()
                .starts_with(r#"WITH "roots" ("web_id", "entity_uuid") AS (SELECT"#)
        );
    }
}
