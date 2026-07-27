use core::fmt;

use crate::store::postgres::query::{Expression, NonEmptyVec, SetQuantifier, Transpile};

/// `GROUP BY [ ALL | DISTINCT ] grouping_element [, ...]`.
#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct GroupByClause {
    pub quantifier: Option<SetQuantifier>,
    /// The `grouping_element` list of the clause.
    ///
    /// Accepts a single [`GroupingElement`] or a ready-made [`NonEmptyVec`]; parse a [`Vec`]
    /// beforehand via `NonEmptyVec::try_from`.
    #[builder(into)]
    pub grouping_elements: NonEmptyVec<GroupingElement>,
}

/// A `grouping_element` of the `GROUP BY` clause.
///
/// Covers the plain expression forms; `ROLLUP`, `CUBE`, and `GROUPING SETS` are not
/// representable yet.
#[derive(Debug, Clone, PartialEq)]
pub enum GroupingElement {
    /// The grammar's `( )`, grouping all rows into a single group.
    Empty,
    /// `expression` or `( expression [, ...] )`.
    Expressions(NonEmptyVec<Expression>),
}

impl Transpile for GroupingElement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Empty => fmt.write_str("()"),
            Self::Expressions(expressions) => match &**expressions {
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
        fmt.write_str("GROUP BY ")?;
        if let Some(quantifier) = self.quantifier {
            quantifier.transpile(fmt)?;
            fmt.write_str(" ")?;
        }
        for (idx, element) in self.grouping_elements.iter().enumerate() {
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
        let clause = GroupByClause::builder()
            .grouping_elements(
                NonEmptyVec::try_from(vec![
                    GroupingElement::Expressions(NonEmptyVec::from(web_id())),
                    GroupingElement::Expressions(NonEmptyVec::from(entity_uuid())),
                ])
                .expect("two grouping elements should form a valid `GROUP BY`"),
            )
            .build();
        assert_eq!(
            clause.transpile_to_string(),
            r#"GROUP BY "entity_temporal_metadata_1_2_3"."web_id", "entity_temporal_metadata_4_5_6"."entity_uuid""#
        );
    }

    #[test]
    fn transpile_quantifier_and_lists() {
        let clause = GroupByClause::builder()
            .quantifier(SetQuantifier::Distinct)
            .grouping_elements(
                NonEmptyVec::try_from(vec![
                    GroupingElement::Expressions(
                        NonEmptyVec::try_from(vec![web_id(), entity_uuid()])
                            .expect("two expressions should form a valid grouping element"),
                    ),
                    GroupingElement::Empty,
                ])
                .expect("two grouping elements should form a valid `GROUP BY`"),
            )
            .build();
        assert_eq!(
            clause.transpile_to_string(),
            r#"GROUP BY DISTINCT ("entity_temporal_metadata_1_2_3"."web_id", "entity_temporal_metadata_4_5_6"."entity_uuid"), ()"#
        );
    }
}
