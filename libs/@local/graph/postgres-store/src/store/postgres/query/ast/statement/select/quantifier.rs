use core::fmt::{self, Write as _};

use crate::store::postgres::query::{Expression, NonEmptyVec, Transpile};

/// `SELECT [ ALL | DISTINCT [ ON ( expression [, ...] ) ] ]`.
#[derive(Debug, Clone, PartialEq)]
pub enum SelectQuantifier {
    All,
    Distinct,
    DistinctOn(NonEmptyVec<Expression>),
}

impl SelectQuantifier {
    /// Creates a `DISTINCT ON ( expression [, ...] )` quantifier.
    ///
    /// Accepts a single [`Expression`] or a ready-made [`NonEmptyVec`]; parse a [`Vec`]
    /// beforehand via `NonEmptyVec::try_from`.
    pub fn distinct_on(expressions: impl Into<NonEmptyVec<Expression>>) -> Self {
        Self::DistinctOn(expressions.into())
    }
}

impl Transpile for SelectQuantifier {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::All => fmt.write_str("ALL"),
            Self::Distinct => fmt.write_str("DISTINCT"),
            Self::DistinctOn(on) => {
                fmt.write_str("DISTINCT ON(")?;
                for (idx, expression) in on.iter().enumerate() {
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

        let mut on = NonEmptyVec::from(base_url());
        on.push(version());
        assert_eq!(
            SelectQuantifier::DistinctOn(on).transpile_to_string(),
            r#"DISTINCT ON("ontology_ids"."base_url", "ontology_ids"."version")"#
        );
    }
}
