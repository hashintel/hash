mod quantifier;

use core::fmt::{self, Write as _};

pub use self::quantifier::{DistinctOn, EmptyDistinctOn, SelectQuantifier};
use self::select_statement_builder::{IsUnset, SetQuantifier, State};
use crate::store::postgres::query::{
    FromItem, GroupByClause, OrderByClause, SelectExpression, Transpile, WhereClause, WithClause,
};

#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct SelectStatement {
    #[builder(default)]
    pub with: WithClause,
    pub quantifier: Option<SelectQuantifier>,
    pub selects: Vec<SelectExpression>,
    #[builder(into)]
    pub from: Option<FromItem<'static>>,
    #[builder(default)]
    pub where_clause: WhereClause,
    #[builder(default)]
    pub order_by_clause: OrderByClause,
    #[builder(default)]
    pub group_by_clause: GroupByClause,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
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
    /// [`Expression`]: crate::store::postgres::query::Expression
    ///
    /// # Errors
    ///
    /// Returns `E::Error` when the conversion fails — for [`Vec`] input this is
    /// [`EmptyDistinctOn`] on an empty list. Single-[`Expression`] input is infallible.
    pub fn distinct_on<E>(
        self,
        expressions: E,
    ) -> Result<SelectStatementBuilder<SetQuantifier<S>>, E::Error>
    where
        E: TryInto<DistinctOn>,
        S::Quantifier: IsUnset,
    {
        Ok(self.quantifier(SelectQuantifier::DistinctOn(expressions.try_into()?)))
    }
}

impl Transpile for SelectStatement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if !self.with.is_empty() {
            self.with.transpile(fmt)?;
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

        if !self.order_by_clause.is_empty() {
            fmt.write_char('\n')?;
            self.order_by_clause.transpile(fmt)?;
        }

        if !self.group_by_clause.expressions.is_empty() {
            fmt.write_char('\n')?;
            self.group_by_clause.transpile(fmt)?;
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
    use super::*;
    use crate::store::postgres::query::SelectExpression;

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
}
