use core::fmt;

use crate::store::postgres::query::{Expression, Transpile};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SelectExpression {
    pub expression: Expression,
    pub alias: Option<&'static str>,
}

impl SelectExpression {
    #[must_use]
    #[inline]
    pub const fn new(expression: Expression, alias: Option<&'static str>) -> Self {
        Self { expression, alias }
    }
}

impl Transpile for SelectExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.expression.transpile(fmt)?;
        if let Some(alias) = &self.alias {
            write!(fmt, r#" AS "{alias}""#)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::data_type::DataTypeQueryPath;

    use super::*;
    use crate::store::postgres::query::{Alias, Function, PostgresQueryPath as _, WindowStatement};

    #[test]
    fn transpile_select_expression() {
        assert_eq!(
            SelectExpression::new(
                Expression::ColumnReference {
                    column: DataTypeQueryPath::BaseUrl.terminating_column().0,
                    table_alias: Some(Alias {
                        condition_index: 1,
                        chain_depth: 2,
                        number: 3,
                    })
                },
                None
            )
            .transpile_to_string(),
            r#""ontology_ids_1_2_3"."base_url""#
        );

        assert_eq!(
            SelectExpression::new(
                Expression::Window(
                    Box::new(Expression::Function(Function::Max(Box::new(
                        Expression::ColumnReference {
                            column: DataTypeQueryPath::Version.terminating_column().0,
                            table_alias: Some(Alias {
                                condition_index: 1,
                                chain_depth: 2,
                                number: 3,
                            })
                        }
                    )))),
                    WindowStatement::partition_by(Expression::ColumnReference {
                        column: DataTypeQueryPath::BaseUrl.terminating_column().0,
                        table_alias: Some(Alias {
                            condition_index: 1,
                            chain_depth: 2,
                            number: 3,
                        })
                    })
                ),
                Some("latest_version")
            )
            .transpile_to_string(),
            r#"MAX("ontology_ids_1_2_3"."version") OVER (PARTITION BY "ontology_ids_1_2_3"."base_url") AS "latest_version""#
        );
    }
}
