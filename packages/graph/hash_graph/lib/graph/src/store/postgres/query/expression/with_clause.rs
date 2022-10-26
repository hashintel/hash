use std::fmt::{self, Write};

use serde::Serialize;

use crate::store::postgres::query::{Statement, TableName, Transpile};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct CommonTableExpression<'q> {
    table_name: TableName,
    statement: Statement<'q>,
}

#[derive(Default, Debug, PartialEq, Eq, Hash)]
pub struct WithExpression<'q> {
    common_table_expressions: Vec<CommonTableExpression<'q>>,
}

impl<'q> WithExpression<'q> {
    pub fn add_statement(&mut self, table_name: TableName, statement: impl Into<Statement<'q>>) {
        self.common_table_expressions.push(CommonTableExpression {
            table_name,
            statement: statement.into(),
        });
    }

    pub fn len(&self) -> usize {
        self.common_table_expressions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.common_table_expressions.is_empty()
    }
}

impl Transpile for WithExpression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if self.common_table_expressions.is_empty() {
            return Ok(());
        }

        fmt.write_str("WITH ")?;
        for (idx, expression) in self.common_table_expressions.iter().enumerate() {
            fmt.write_char('"')?;
            expression.table_name.serialize(&mut *fmt)?;
            fmt.write_str("\" AS (")?;
            expression.statement.transpile(fmt)?;
            fmt.write_char(')')?;
            if idx + 1 < self.common_table_expressions.len() {
                fmt.write_str(",  ")?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use super::*;
    use crate::{
        ontology::DataTypeQueryPath,
        store::postgres::query::{
            expression::OrderByExpression,
            test_helper::{max_version_expression, trim_whitespace},
            Expression, Path, SelectExpression, SelectStatement, Table, TableName, WhereExpression,
        },
    };

    #[test]
    fn transpile_with_expression() {
        let mut with_clause = WithExpression::default();
        assert_eq!(with_clause.transpile_to_string(), "");

        with_clause.add_statement(TableName::TypeIds, SelectStatement {
            with: WithExpression::default(),
            distinct: false,
            selects: vec![
                SelectExpression::new(Expression::Asterisk, None),
                SelectExpression::new(
                    max_version_expression(),
                    Some(Cow::Borrowed("latest_version")),
                ),
            ],
            from: Table {
                name: DataTypeQueryPath::Version.terminating_table_name(),
                alias: None,
            },
            joins: vec![],
            where_expression: WhereExpression::default(),
            order_by_expression: OrderByExpression::default(),
        });

        assert_eq!(
            trim_whitespace(with_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WITH "type_ids" AS (SELECT *, MAX("type_ids"."version") OVER (PARTITION BY "type_ids"."base_uri") AS "latest_version" FROM "type_ids")"#
            )
        );

        with_clause.add_statement(TableName::DataTypes, SelectStatement {
            with: WithExpression::default(),
            distinct: false,
            selects: vec![SelectExpression::new(Expression::Asterisk, None)],
            from: Table {
                name: TableName::DataTypes,
                alias: None,
            },
            joins: vec![],
            where_expression: WhereExpression::default(),
            order_by_expression: OrderByExpression::default(),
        });

        assert_eq!(
            trim_whitespace(with_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WITH "type_ids" AS (SELECT *, MAX("type_ids"."version") OVER (PARTITION BY "type_ids"."base_uri") AS "latest_version" FROM "type_ids"),
                     "data_types" AS (SELECT * FROM "data_types")"#
            )
        );
    }
}
