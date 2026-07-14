mod quantifier;

use core::fmt::{self, Write as _};

pub use self::quantifier::SelectQuantifier;
use self::select_statement_builder::{IsComplete, IsUnset, SetQuantifier, State};
use crate::store::postgres::query::{
    Expression, FromItem, GroupByClause, NonEmptyVec, OrderByClause, SelectExpression, Statement,
    Transpile, WhereClause, WithClause,
};

#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct SelectStatement {
    #[builder(into)]
    pub with: Option<WithClause>,
    pub quantifier: Option<SelectQuantifier>,
    pub selects: Vec<SelectExpression>,
    #[builder(into)]
    pub from: Option<FromItem<'static>>,
    #[builder(default)]
    pub where_clause: WhereClause,
    #[builder(into)]
    pub group_by: Option<GroupByClause>,
    pub having: Option<Expression>,
    #[builder(default)]
    pub order_by: OrderByClause,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

impl<S> From<SelectStatementBuilder<S>> for Statement
where
    S: IsComplete,
{
    fn from(builder: SelectStatementBuilder<S>) -> Self {
        Self::from(builder.build())
    }
}

impl<S: State> SelectStatementBuilder<S> {
    /// Sets the quantifier to plain `DISTINCT`, removing duplicate rows.
    pub fn distinct(self) -> SelectStatementBuilder<SetQuantifier<S>>
    where
        S::Quantifier: IsUnset,
    {
        self.quantifier(SelectQuantifier::Distinct)
    }

    /// Sets the quantifier to `DISTINCT ON ( expression [, ...] )`.
    ///
    /// Accepts a single [`Expression`] or a ready-made [`NonEmptyVec`]; parse a [`Vec`]
    /// beforehand via `NonEmptyVec::try_from`.
    pub fn distinct_on(
        self,
        expressions: impl Into<NonEmptyVec<Expression>>,
    ) -> SelectStatementBuilder<SetQuantifier<S>>
    where
        S::Quantifier: IsUnset,
    {
        self.quantifier(SelectQuantifier::DistinctOn(expressions.into()))
    }
}

impl Transpile for SelectStatement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if let Some(with) = &self.with {
            with.transpile(fmt)?;
            fmt.write_char('\n')?;
        }

        fmt.write_str("SELECT ")?;

        if let Some(quantifier) = &self.quantifier {
            quantifier.transpile(fmt)?;
            fmt.write_char(' ')?;
        }

        for (idx, condition) in self.selects.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            condition.transpile(fmt)?;
        }
        if let Some(from) = &self.from {
            fmt.write_str("\nFROM ")?;
            from.transpile(fmt)?;
        }

        if !self.where_clause.is_empty() {
            fmt.write_char('\n')?;
            self.where_clause.transpile(fmt)?;
        }

        if let Some(group_by) = &self.group_by {
            fmt.write_char('\n')?;
            group_by.transpile(fmt)?;
        }

        if let Some(having) = &self.having {
            fmt.write_str("\nHAVING ")?;
            having.transpile(fmt)?;
        }

        if !self.order_by.is_empty() {
            fmt.write_char('\n')?;
            self.order_by.transpile(fmt)?;
        }

        if let Some(limit) = self.limit {
            fmt.write_char('\n')?;
            write!(fmt, "LIMIT {limit}")?;
        }

        if let Some(offset) = self.offset {
            fmt.write_char('\n')?;
            write!(fmt, "OFFSET {offset}")?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::{entity::EntityQueryPath, query::Ordering};

    use super::*;
    use crate::store::postgres::query::{
        Alias, Constant, Function, GroupingElement, PostgresQueryPath as _, SelectExpression,
    };

    #[test]
    fn builder_sets_quantifier() {
        let statement = SelectStatement::builder()
            .distinct()
            .selects(vec![SelectExpression::Asterisk(None)])
            .build();

        assert!(
            statement
                .transpile_to_string()
                .starts_with("SELECT DISTINCT *")
        );
    }

    #[test]
    fn transpile_clause_order() {
        let web_id = || {
            Expression::ColumnReference(EntityQueryPath::WebId.terminating_column().0.aliased(
                Alias {
                    condition_index: 0,
                    chain_depth: 0,
                    number: 0,
                },
            ))
        };

        let mut order_by = OrderByClause::default();
        order_by.push(web_id(), Ordering::Ascending, None);

        let statement = SelectStatement::builder()
            .selects(vec![SelectExpression::Asterisk(None)])
            .group_by(
                GroupByClause::builder()
                    .grouping_elements(GroupingElement::Expressions(vec![web_id()])),
            )
            .having(Expression::greater(
                Expression::Function(Function::Max(Box::new(web_id()))),
                Expression::Constant(Constant::U32(1)),
            ))
            .order_by(order_by)
            .build();

        assert_eq!(
            statement.transpile_to_string(),
            "SELECT *\nGROUP BY \"entity_temporal_metadata_0_0_0\".\"web_id\"\nHAVING \
             MAX(\"entity_temporal_metadata_0_0_0\".\"web_id\") > 1\nORDER BY \
             \"entity_temporal_metadata_0_0_0\".\"web_id\" ASC"
        );
    }
}
