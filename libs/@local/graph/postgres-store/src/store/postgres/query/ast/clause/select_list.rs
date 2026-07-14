use core::fmt::{self, Write as _};

use crate::store::postgres::query::{Expression, Identifier, TableReference, Transpile};

/// A SELECT clause item.
///
/// PostgreSQL SELECT syntax allows either expressions with optional aliases,
/// or the special `*` wildcard to select all columns from a table or all tables.
#[derive(Debug, Clone, PartialEq)]
pub enum SelectExpression {
    /// A regular expression with an optional output name.
    ///
    /// Transpiles to: `expression` or `expression AS "output_name"`.
    Expression {
        expression: Expression,
        output_name: Option<Identifier<'static>>,
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
            Self::Expression {
                expression,
                output_name,
            } => {
                expression.transpile(fmt)?;
                if let Some(output_name) = output_name {
                    fmt.write_str(" AS ")?;
                    output_name.transpile(fmt)?;
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
        Alias, Function, PostgresQueryPath as _, Table, TableName, WindowDefinition,
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
                output_name: None
            }
            .transpile_to_string(),
            r#""ontology_ids_1_2_3"."base_url""#
        );

        assert_eq!(
            SelectExpression::Expression {
                expression: Expression::window(
                    Expression::Function(Function::Max(Box::new(Expression::ColumnReference(
                        DataTypeQueryPath::Version
                            .terminating_column()
                            .0
                            .aliased(Alias {
                                condition_index: 1,
                                chain_depth: 2,
                                number: 3,
                            })
                    )))),
                    WindowDefinition::builder().partition_by(Expression::ColumnReference(
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
                output_name: Some(Identifier::from("latest_version"))
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
        };

        assert_eq!(
            SelectExpression::Asterisk(Some(table_ref)).transpile_to_string(),
            r#""data_types".*"#
        );
    }
}
