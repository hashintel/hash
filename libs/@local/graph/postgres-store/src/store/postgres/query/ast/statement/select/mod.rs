mod clause;
mod quantifier;
mod simple;

use core::fmt::{self, Write as _};

use self::select_statement_builder::IsComplete;
pub use self::{
    clause::{SelectClause, SetOperator},
    quantifier::SelectQuantifier,
    simple::SimpleSelect,
};
use crate::store::postgres::query::{OrderByClause, Statement, Transpile, WithClause};

/// gram.y's `select_no_parens`: the clauses that apply to a whole select statement.
///
/// `ORDER BY`, `LIMIT`, and `OFFSET` attach to the result of the [`SelectClause`] tree — never
/// to a bare set-operation operand. The locking (`FOR …`) and `FETCH` forms are not
/// representable yet.
#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct SelectStatement {
    #[builder(into)]
    pub with: Option<WithClause>,
    #[builder(into)]
    pub select_clause: SelectClause,
    #[builder(default)]
    pub order_by: OrderByClause,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

impl From<SimpleSelect> for SelectStatement {
    fn from(select: SimpleSelect) -> Self {
        Self::from(SelectClause::from(select))
    }
}

impl From<SelectClause> for SelectStatement {
    fn from(select_clause: SelectClause) -> Self {
        Self {
            with: None,
            select_clause,
            order_by: OrderByClause::default(),
            limit: None,
            offset: None,
        }
    }
}

impl From<SelectClause> for Statement {
    fn from(select_clause: SelectClause) -> Self {
        Self::from(SelectStatement::from(select_clause))
    }
}

impl<S> From<SelectStatementBuilder<S>> for Statement
where
    S: IsComplete,
{
    fn from(builder: SelectStatementBuilder<S>) -> Self {
        Self::from(builder.build())
    }
}

impl Transpile for SelectStatement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if let Some(with) = &self.with {
            with.transpile(fmt)?;
            fmt.write_char('\n')?;
        }

        self.select_clause.transpile(fmt)?;

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
        Alias, Constant, Expression, Function, GroupByClause, GroupingElement,
        PostgresQueryPath as _, SelectExpression,
    };

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
            .select_clause(
                SimpleSelect::builder()
                    .selects(vec![SelectExpression::Asterisk(None)])
                    .group_by(
                        GroupByClause::builder()
                            .grouping_elements(GroupingElement::Expressions(vec![web_id()])),
                    )
                    .having(Expression::greater(
                        Expression::Function(Function::Max(Box::new(web_id()))),
                        Expression::Constant(Constant::U32(1)),
                    )),
            )
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
