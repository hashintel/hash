use core::fmt;

use crate::store::postgres::query::{Expression, SetQuantifier, Transpile};

/// `GROUP BY [ ALL | DISTINCT ] grouping_element [, ...]`
///
/// An empty `elements` list means the clause is omitted entirely.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct GroupByClause {
    pub quantifier: Option<SetQuantifier>,
    pub elements: Vec<GroupingElement>,
}

/// A `grouping_element` of the `GROUP BY` clause.
///
/// Covers the plain expression forms; `ROLLUP`, `CUBE`, and `GROUPING SETS` are not
/// representable yet.
#[derive(Debug, Clone, PartialEq)]
pub enum GroupingElement {
    /// `expression`, `( expression [, ...] )`, or — with an empty list — the grammar's `( )`,
    /// which groups all rows into a single group.
    Expressions(Vec<Expression>),
}

impl Transpile for GroupingElement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Expressions(expressions) => match expressions.as_slice() {
                [expression] => expression.transpile(fmt),
                expressions => {
                    fmt.write_str("(")?;
                    for (idx, expression) in expressions.iter().enumerate() {
                        if idx > 0 {
                            fmt.write_str(", ")?;
                        }
                        expression.transpile(fmt)?;
                    }
                    fmt.write_str(")")
                }
            },
        }
    }
}

impl Transpile for GroupByClause {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if self.elements.is_empty() {
            return Ok(());
        }

        fmt.write_str("GROUP BY ")?;
        if let Some(quantifier) = self.quantifier {
            quantifier.transpile(fmt)?;
            fmt.write_str(" ")?;
        }
        for (idx, element) in self.elements.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            element.transpile(fmt)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::entity::EntityQueryPath;

    use super::*;
    use crate::store::postgres::query::{Alias, PostgresQueryPath as _};

    fn web_id() -> Expression {
        Expression::ColumnReference(
            EntityQueryPath::WebId
                .terminating_column()
                .0
                .aliased(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                }),
        )
    }

    fn entity_uuid() -> Expression {
        Expression::ColumnReference(EntityQueryPath::Uuid.terminating_column().0.aliased(Alias {
            condition_index: 4,
            chain_depth: 5,
            number: 6,
        }))
    }

    #[test]
    fn transpile_plain_elements() {
        let clause = GroupByClause {
            quantifier: None,
            elements: vec![
                GroupingElement::Expressions(vec![web_id()]),
                GroupingElement::Expressions(vec![entity_uuid()]),
            ],
        };
        assert_eq!(
            clause.transpile_to_string(),
            r#"GROUP BY "entity_temporal_metadata_1_2_3"."web_id", "entity_temporal_metadata_4_5_6"."entity_uuid""#
        );
    }

    #[test]
    fn transpile_quantifier_and_lists() {
        let clause = GroupByClause {
            quantifier: Some(SetQuantifier::Distinct),
            elements: vec![
                GroupingElement::Expressions(vec![web_id(), entity_uuid()]),
                GroupingElement::Expressions(Vec::new()),
            ],
        };
        assert_eq!(
            clause.transpile_to_string(),
            r#"GROUP BY DISTINCT ("entity_temporal_metadata_1_2_3"."web_id", "entity_temporal_metadata_4_5_6"."entity_uuid"), ()"#
        );
    }
}
