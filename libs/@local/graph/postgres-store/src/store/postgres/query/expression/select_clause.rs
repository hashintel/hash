use core::fmt;

use crate::store::postgres::query::{Expression, Transpile};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectExpression {
    pub expression: Expression,
    pub alias: Option<&'static str>,
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
            SelectExpression {
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
            SelectExpression {
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
}
