use core::fmt::{self, Write as _};

use self::simple_select_builder::{IsComplete, IsUnset, SetQuantifier as QuantifierSet, State};
use crate::store::postgres::query::{
    Expression, FromItem, GroupByClause, NonEmptyVec, SelectClause, SelectExpression,
    SelectQuantifier, SelectStatement, Statement, Transpile,
};

/// The `SELECT …` arm of gram.y's `simple_select`.
///
/// Holds everything up to the `WINDOW` clause; `WITH`, `ORDER BY`, `LIMIT`, and `OFFSET` belong
/// to the enclosing [`SelectStatement`] (`select_no_parens`), set operations to
/// [`SelectClause`]. The `INTO` and `WINDOW` clauses and the `VALUES`/`TABLE` forms are not
/// representable yet.
#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct SimpleSelect {
    pub quantifier: Option<SelectQuantifier>,
    /// The target list of the statement.
    ///
    /// Accepts a single [`SelectExpression`] or a ready-made [`NonEmptyVec`]; parse a [`Vec`]
    /// beforehand via `NonEmptyVec::try_from`.
    #[builder(into)]
    pub selects: NonEmptyVec<SelectExpression>,
    #[builder(into)]
    pub from: Option<FromItem<'static>>,
    pub where_clause: Option<Expression>,
    #[builder(into)]
    pub group_by: Option<GroupByClause>,
    pub having: Option<Expression>,
}

impl<S> From<SimpleSelectBuilder<S>> for SelectClause
where
    S: IsComplete,
{
    fn from(builder: SimpleSelectBuilder<S>) -> Self {
        Self::from(builder.build())
    }
}

impl<S> From<SimpleSelectBuilder<S>> for SelectStatement
where
    S: IsComplete,
{
    fn from(builder: SimpleSelectBuilder<S>) -> Self {
        Self::from(builder.build())
    }
}

impl From<SimpleSelect> for Statement {
    fn from(select: SimpleSelect) -> Self {
        Self::from(SelectStatement::from(select))
    }
}

impl<S> From<SimpleSelectBuilder<S>> for Statement
where
    S: IsComplete,
{
    fn from(builder: SimpleSelectBuilder<S>) -> Self {
        Self::from(SelectStatement::from(builder.build()))
    }
}

impl<S: State> SimpleSelectBuilder<S> {
    /// Sets the quantifier to plain `DISTINCT`, removing duplicate rows.
    pub fn distinct(self) -> SimpleSelectBuilder<QuantifierSet<S>>
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
    ) -> SimpleSelectBuilder<QuantifierSet<S>>
    where
        S::Quantifier: IsUnset,
    {
        self.quantifier(SelectQuantifier::DistinctOn(expressions.into()))
    }
}

impl Transpile for SimpleSelect {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
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

        if let Some(where_clause) = &self.where_clause {
            fmt.write_str("\nWHERE ")?;
            where_clause.transpile(fmt)?;
        }

        if let Some(group_by) = &self.group_by {
            fmt.write_char('\n')?;
            group_by.transpile(fmt)?;
        }

        if let Some(having) = &self.having {
            fmt.write_str("\nHAVING ")?;
            having.transpile(fmt)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builder_sets_quantifier() {
        let statement = SimpleSelect::builder()
            .distinct()
            .selects(SelectExpression::Asterisk(None))
            .build();

        assert!(
            statement
                .transpile_to_string()
                .starts_with("SELECT DISTINCT *")
        );
    }
}
