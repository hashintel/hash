use core::{
    error::Error,
    fmt::{self, Write as _},
};

use crate::store::postgres::query::{
    Expression, FromItem, GroupByClause, OrderByClause, SelectExpression, Transpile, WhereClause,
    WithClause,
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

/// `SELECT [ ALL | DISTINCT [ ON ( expression [, ...] ) ] ]`
#[derive(Debug, Clone, PartialEq)]
pub enum SelectQuantifier {
    All,
    Distinct,
    DistinctOn(DistinctOn),
}

impl SelectQuantifier {
    /// Creates a `DISTINCT ON ( expression [, ...] )` quantifier.
    ///
    /// # Errors
    ///
    /// Returns `E::Error` when the conversion fails — for [`Vec`] input this is
    /// [`EmptyDistinctOn`] on an empty list. Single-[`Expression`] input is infallible.
    pub fn distinct_on<E>(expressions: E) -> Result<Self, E::Error>
    where
        E: TryInto<DistinctOn>,
    {
        expressions.try_into().map(Self::DistinctOn)
    }
}

impl Transpile for SelectQuantifier {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::All => fmt.write_str("ALL"),
            Self::Distinct => fmt.write_str("DISTINCT"),
            Self::DistinctOn(on) => {
                fmt.write_str("DISTINCT ON(")?;
                for (idx, expression) in on.expressions().iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(", ")?;
                    }
                    expression.transpile(fmt)?;
                }
                fmt.write_char(')')
            }
        }
    }
}

/// The expression list of `DISTINCT ON ( expression [, ...] )`.
///
/// Never empty: `DISTINCT ON ()` is a syntax error, and treating it as plain `DISTINCT` would
/// silently change semantics. The field is private, so every construction path validates.
#[derive(Debug, Clone, PartialEq)]
pub struct DistinctOn(Vec<Expression>);

#[derive(Debug, PartialEq, Eq, derive_more::Display)]
#[display("`DISTINCT ON` requires at least one expression")]
pub struct EmptyDistinctOn;

impl Error for EmptyDistinctOn {}

impl DistinctOn {
    pub fn push(&mut self, expression: Expression) {
        self.0.push(expression);
    }

    #[must_use]
    pub fn expressions(&self) -> &[Expression] {
        &self.0
    }
}

impl From<Expression> for DistinctOn {
    fn from(expression: Expression) -> Self {
        Self(vec![expression])
    }
}

impl TryFrom<Vec<Expression>> for DistinctOn {
    type Error = EmptyDistinctOn;

    fn try_from(expressions: Vec<Expression>) -> Result<Self, Self::Error> {
        if expressions.is_empty() {
            return Err(EmptyDistinctOn);
        }
        Ok(Self(expressions))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Distinctness {
    Indistinct,
    Distinct,
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
    use crate::store::postgres::query::{Column, ColumnReference, table::OntologyIds};

    fn base_url() -> Expression {
        Expression::ColumnReference(ColumnReference::from(Column::OntologyIds(
            OntologyIds::BaseUrl,
        )))
    }

    fn version() -> Expression {
        Expression::ColumnReference(ColumnReference::from(Column::OntologyIds(
            OntologyIds::Version,
        )))
    }

    #[test]
    fn transpile_select_quantifier() {
        assert_eq!(SelectQuantifier::All.transpile_to_string(), "ALL");
        assert_eq!(SelectQuantifier::Distinct.transpile_to_string(), "DISTINCT");

        let mut on = DistinctOn::from(base_url());
        on.push(version());
        assert_eq!(
            SelectQuantifier::DistinctOn(on).transpile_to_string(),
            r#"DISTINCT ON("ontology_ids"."base_url", "ontology_ids"."version")"#
        );
    }

    #[test]
    fn distinct_on_rejects_empty_expressions() {
        assert_eq!(
            SelectQuantifier::distinct_on(Vec::new())
                .expect_err("`DISTINCT ON` without expressions should be rejected"),
            EmptyDistinctOn
        );
        SelectQuantifier::distinct_on(vec![base_url()])
            .expect("a non-empty expression list should form a valid `DISTINCT ON`");
        let Ok(_) = SelectQuantifier::distinct_on(base_url());
    }
}
