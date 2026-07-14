use core::fmt::{self, Write as _};

use crate::store::postgres::query::{SetQuantifier, SimpleSelect, Transpile};

/// The operator of a `select_clause { UNION | INTERSECT | EXCEPT } … select_clause` production.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum SetOperator {
    Union,
    Intersect,
    Except,
}

impl Transpile for SetOperator {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Union => fmt.write_str("UNION"),
            Self::Intersect => fmt.write_str("INTERSECT"),
            Self::Except => fmt.write_str("EXCEPT"),
        }
    }
}

/// gram.y's `select_clause`: the set-operation tree over [`SimpleSelect`]s.
///
/// Collapses `select_clause` and the set-operation arms of `simple_select` into one type. The
/// parenthesized form (`select_with_parens`, which re-admits `ORDER BY`/`LIMIT` on an operand)
/// is not representable yet.
#[derive(Debug, Clone, PartialEq)]
pub enum SelectClause {
    Simple(Box<SimpleSelect>),
    SetOperation {
        left: Box<Self>,
        operator: SetOperator,
        quantifier: Option<SetQuantifier>,
        right: Box<Self>,
    },
}

impl SelectClause {
    /// Combines two clauses with a set operation, nesting existing trees as the left operand.
    #[must_use]
    pub fn set_operation(
        self,
        operator: SetOperator,
        quantifier: Option<SetQuantifier>,
        other: impl Into<Self>,
    ) -> Self {
        Self::SetOperation {
            left: Box::new(self),
            operator,
            quantifier,
            right: Box::new(other.into()),
        }
    }

    /// `self UNION other`, removing duplicate rows.
    #[must_use]
    pub fn union(self, other: impl Into<Self>) -> Self {
        self.set_operation(SetOperator::Union, None, other)
    }

    /// `self UNION ALL other`, keeping duplicate rows.
    #[must_use]
    pub fn union_all(self, other: impl Into<Self>) -> Self {
        self.set_operation(SetOperator::Union, Some(SetQuantifier::All), other)
    }

    /// `self INTERSECT other`, removing duplicate rows.
    #[must_use]
    pub fn intersect(self, other: impl Into<Self>) -> Self {
        self.set_operation(SetOperator::Intersect, None, other)
    }

    /// `self INTERSECT ALL other`, keeping duplicate rows.
    #[must_use]
    pub fn intersect_all(self, other: impl Into<Self>) -> Self {
        self.set_operation(SetOperator::Intersect, Some(SetQuantifier::All), other)
    }

    /// `self EXCEPT other`, removing duplicate rows.
    #[must_use]
    pub fn except(self, other: impl Into<Self>) -> Self {
        self.set_operation(SetOperator::Except, None, other)
    }

    /// `self EXCEPT ALL other`, keeping duplicate rows.
    #[must_use]
    pub fn except_all(self, other: impl Into<Self>) -> Self {
        self.set_operation(SetOperator::Except, Some(SetQuantifier::All), other)
    }
}

impl From<SimpleSelect> for SelectClause {
    fn from(select: SimpleSelect) -> Self {
        Self::Simple(Box::new(select))
    }
}

impl Transpile for SelectClause {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        /// Parenthesizes nested set operations so Postgres re-parses the exact tree instead of
        /// applying its own associativity and precedence rules.
        fn transpile_operand(operand: &SelectClause, fmt: &mut fmt::Formatter) -> fmt::Result {
            match operand {
                SelectClause::Simple(select) => select.transpile(fmt),
                SelectClause::SetOperation { .. } => {
                    fmt.write_char('(')?;
                    operand.transpile(fmt)?;
                    fmt.write_char(')')
                }
            }
        }

        match self {
            Self::Simple(select) => select.transpile(fmt),
            Self::SetOperation {
                left,
                operator,
                quantifier,
                right,
            } => {
                transpile_operand(left, fmt)?;
                fmt.write_char('\n')?;
                operator.transpile(fmt)?;
                if let Some(quantifier) = quantifier {
                    fmt.write_char(' ')?;
                    quantifier.transpile(fmt)?;
                }
                fmt.write_char('\n')?;
                transpile_operand(right, fmt)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{SelectExpression, Table, test_helper::trim_whitespace};

    fn select_all(table: Table) -> SimpleSelect {
        SimpleSelect::builder()
            .selects(vec![SelectExpression::Asterisk(None)])
            .from(crate::store::postgres::query::FromItem::table(table))
            .build()
    }

    #[test]
    fn transpile_union_all() {
        let clause = SelectClause::from(select_all(Table::DataTypes))
            .union_all(select_all(Table::PropertyTypes));

        assert_eq!(
            trim_whitespace(&clause.transpile_to_string()),
            trim_whitespace(
                r#"
                SELECT * FROM "data_types"
                UNION ALL
                SELECT * FROM "property_types""#
            )
        );
    }

    #[test]
    fn nested_operations_preserve_grouping() {
        // `a UNION (b INTERSECT c)` — without the parentheses Postgres would parse the higher
        // `INTERSECT` precedence into the same tree, but `(a UNION b) EXCEPT c` below would
        // silently regroup.
        let union_then_intersect = SelectClause::from(select_all(Table::DataTypes)).union(
            SelectClause::from(select_all(Table::PropertyTypes))
                .intersect(select_all(Table::EntityTypes)),
        );

        assert_eq!(
            trim_whitespace(&union_then_intersect.transpile_to_string()),
            trim_whitespace(
                r#"
                SELECT * FROM "data_types"
                UNION
                (SELECT * FROM "property_types"
                INTERSECT
                SELECT * FROM "entity_types")"#
            )
        );

        let except_of_union = SelectClause::from(select_all(Table::DataTypes))
            .union(select_all(Table::PropertyTypes))
            .except(select_all(Table::EntityTypes));

        assert_eq!(
            trim_whitespace(&except_of_union.transpile_to_string()),
            trim_whitespace(
                r#"
                (SELECT * FROM "data_types"
                UNION
                SELECT * FROM "property_types")
                EXCEPT
                SELECT * FROM "entity_types""#
            )
        );
    }
}
