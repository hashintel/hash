use core::fmt;

use self::group_by_clause_builder::IsComplete;
use crate::store::postgres::query::{Expression, NonEmptyVec, SetQuantifier, Transpile};

/// `GROUP BY [ ALL | DISTINCT ] grouping_element [, ...]`.
#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone))]
pub struct GroupByClause {
    quantifier: Option<SetQuantifier>,
    #[builder(setters(vis = "", name = "set_grouping_elements"))]
    grouping_elements: NonEmptyVec<GroupingElement>,
}

impl<S> From<GroupByClauseBuilder<S>> for GroupByClause
where
    S: IsComplete,
{
    fn from(builder: GroupByClauseBuilder<S>) -> Self {
        builder.build()
    }
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

mod group_by_clause_builder_impl {
    use super::{
        GroupByClauseBuilder, GroupingElement,
        group_by_clause_builder::{IsUnset, SetGroupingElements, State},
    };
    use crate::store::postgres::query::NonEmptyVec;

    impl<S: State> GroupByClauseBuilder<S> {
        /// Sets a single `grouping_element`, the infallible special case of
        /// [`grouping_elements`](Self::grouping_elements).
        pub fn grouping_element(
            self,
            element: GroupingElement,
        ) -> GroupByClauseBuilder<SetGroupingElements<S>>
        where
            S: State<GroupingElements: IsUnset>,
        {
            let Ok(builder) = self.grouping_elements(element);
            builder
        }

        /// Sets the `grouping_element` list of the clause.
        ///
        /// # Errors
        ///
        /// Returns `E::Error` when the conversion fails — for [`Vec`] input this is
        /// [`EmptyVec`](crate::store::postgres::query::EmptyVec) on an empty list. Single
        /// [`GroupingElement`] input is infallible.
        pub fn grouping_elements<E>(
            self,
            elements: E,
        ) -> Result<GroupByClauseBuilder<SetGroupingElements<S>>, E::Error>
        where
            E: TryInto<NonEmptyVec<GroupingElement>>,
            S: State<GroupingElements: IsUnset>,
        {
            Ok(self.set_grouping_elements(elements.try_into()?))
        }
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::entity::EntityQueryPath;

    use super::*;
    use crate::store::postgres::query::{Alias, EmptyVec, PostgresQueryPath as _};

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
            .grouping_elements(vec![
                GroupingElement::Expressions(vec![web_id()]),
                GroupingElement::Expressions(vec![entity_uuid()]),
            ])
            .expect("two grouping elements should form a valid `GROUP BY`")
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
            .grouping_elements(vec![
                GroupingElement::Expressions(vec![web_id(), entity_uuid()]),
                GroupingElement::Expressions(Vec::new()),
            ])
            .expect("two grouping elements should form a valid `GROUP BY`")
            .build();
        assert_eq!(
            clause.transpile_to_string(),
            r#"GROUP BY DISTINCT ("entity_temporal_metadata_1_2_3"."web_id", "entity_temporal_metadata_4_5_6"."entity_uuid"), ()"#
        );
    }

    #[test]
    fn group_by_rejects_empty_elements() {
        assert_eq!(
            GroupByClause::builder()
                .grouping_elements(Vec::new())
                .expect_err("a `GROUP BY` without grouping elements should be rejected"),
            EmptyVec
        );
    }
}
