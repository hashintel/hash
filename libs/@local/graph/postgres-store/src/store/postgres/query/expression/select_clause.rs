use core::fmt::{self, Write as _};

use super::TableReference;
use crate::store::postgres::query::{Expression, Transpile};

/// A SELECT clause item.
///
/// PostgreSQL SELECT syntax allows either expressions with optional aliases,
/// or the special `*` wildcard to select all columns from a table or all tables.
#[derive(Debug, Clone, PartialEq)]
pub enum SelectExpression {
    /// A regular expression with an optional alias.
    ///
    /// Transpiles to: `expression` or `expression AS "alias"`.
    Expression {
        expression: Expression,
        alias: Option<&'static str>,
    },
    /// Asterisk wildcard selecting all columns.
    ///
    /// - When `None`: Selects all columns from all tables (`*`)
    /// - When `Some(table)`: Selects all columns from a specific table (`"table".*`)
    Asterisk(Option<TableReference<'static>>),
}

impl Transpile for SelectExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Expression { expression, alias } => {
                expression.transpile(fmt)?;
                if let Some(alias) = alias {
                    write!(fmt, r#" AS "{alias}""#)?;
                }
                Ok(())
            }
            Self::Asterisk(None) => fmt.write_char('*'),
            Self::Asterisk(Some(table)) => {
                table.transpile(fmt)?;
                fmt.write_str(".*")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::data_type::DataTypeQueryPath;

    use super::*;
    use crate::store::postgres::query::{
        Alias, Function, PostgresQueryPath as _, Table, WindowStatement, expression::TableName,
    };

    #[test]
    fn transpile_select_expression() {
        assert_eq!(
            SelectExpression::Expression {
                expression: Expression::ColumnReference(
                    DataTypeQueryPath::BaseUrl
                        .terminating_column()
                        .0
                        .aliased(Alias {
                            condition_index: 1,
                            chain_depth: 2,
                            number: 3,
                        })
                ),
                alias: None
            }
            .transpile_to_string(),
            r#""ontology_ids_1_2_3"."base_url""#
        );

        assert_eq!(
            SelectExpression::Expression {
                expression: Expression::Window(
                    Box::new(Expression::Function(Function::Max(Box::new(
                        Expression::ColumnReference(
                            DataTypeQueryPath::Version
                                .terminating_column()
                                .0
                                .aliased(Alias {
                                    condition_index: 1,
                                    chain_depth: 2,
                                    number: 3,
                                })
                        ),
                    )))),
                    WindowStatement::partition_by(Expression::ColumnReference(
                        DataTypeQueryPath::BaseUrl
                            .terminating_column()
                            .0
                            .aliased(Alias {
                                condition_index: 1,
                                chain_depth: 2,
                                number: 3,
                            })
                    ))
                ),
                alias: Some("latest_version")
            }
            .transpile_to_string(),
            r#"MAX("ontology_ids_1_2_3"."version") OVER (PARTITION BY "ontology_ids_1_2_3"."base_url") AS "latest_version""#
        );
    }

    #[test]
    fn transpile_asterisk() {
        assert_eq!(SelectExpression::Asterisk(None).transpile_to_string(), "*");
    }

    #[test]
    fn transpile_qualified_asterisk() {
        let table_ref = TableReference {
            schema: None,
            name: TableName::from(Table::DataTypes),
            alias: None,
        };

        assert_eq!(
            SelectExpression::Asterisk(Some(table_ref)).transpile_to_string(),
            r#""data_types".*"#
        );
    }
}
