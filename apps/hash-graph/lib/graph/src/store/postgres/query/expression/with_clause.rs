use std::fmt::{self, Write};

use crate::store::postgres::query::{Statement, Table, Transpile};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct CommonTableExpression<'p> {
    table: Table,
    statement: Statement<'p>,
}

#[derive(Default, Debug, PartialEq, Eq, Hash)]
pub struct WithExpression<'p> {
    common_table_expressions: Vec<CommonTableExpression<'p>>,
}

impl<'p> WithExpression<'p> {
    pub fn add_statement(&mut self, table: Table, statement: impl Into<Statement<'p>>) {
        self.common_table_expressions.push(CommonTableExpression {
            table,
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
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            expression.table.transpile(fmt)?;
            fmt.write_str(" AS (")?;
            expression.statement.transpile(fmt)?;
            fmt.write_char(')')?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use super::*;
    use crate::store::postgres::query::{
        expression::OrderByExpression,
        test_helper::{max_version_expression, trim_whitespace},
        Alias, Expression, SelectExpression, SelectStatement, Table, WhereExpression,
    };

    #[test]
    fn transpile_with_expression() {
        let mut with_clause = WithExpression::default();
        assert_eq!(with_clause.transpile_to_string(), "");

        with_clause.add_statement(Table::TypeIds, SelectStatement {
            with: WithExpression::default(),
            distinct: Vec::new(),
            selects: vec![
                SelectExpression::new(Expression::Asterisk, None),
                SelectExpression::new(
                    max_version_expression(),
                    Some(Cow::Borrowed("latest_version")),
                ),
            ],
            from: Table::TypeIds.aliased(Alias {
                condition_index: 0,
                chain_depth: 0,
                number: 0,
            }),
            joins: vec![],
            where_expression: WhereExpression::default(),
            order_by_expression: OrderByExpression::default(),
        });

        assert_eq!(
            trim_whitespace(with_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WITH "type_ids" AS (SELECT *, MAX("type_ids_0_0_0"."version") OVER (PARTITION BY "type_ids_0_0_0"."base_uri") AS "latest_version" FROM "type_ids" AS "type_ids_0_0_0")"#
            )
        );

        with_clause.add_statement(Table::DataTypes, SelectStatement {
            with: WithExpression::default(),
            distinct: Vec::new(),
            selects: vec![SelectExpression::new(Expression::Asterisk, None)],
            from: Table::DataTypes.aliased(Alias {
                condition_index: 3,
                chain_depth: 4,
                number: 5,
            }),
            joins: vec![],
            where_expression: WhereExpression::default(),
            order_by_expression: OrderByExpression::default(),
        });

        assert_eq!(
            trim_whitespace(with_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WITH "type_ids" AS (SELECT *, MAX("type_ids_0_0_0"."version") OVER (PARTITION BY "type_ids_0_0_0"."base_uri") AS "latest_version" FROM "type_ids" AS "type_ids_0_0_0"),
                     "data_types" AS (SELECT * FROM "data_types" AS "data_types_3_4_5")"#
            )
        );
    }
}
