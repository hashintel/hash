use core::fmt;

use crate::store::postgres::query::Transpile;

/// SQL JOIN types supported in PostgreSQL queries.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JoinType {
    /// INNER JOIN - returns rows when there is a match in both tables.
    Inner,
    /// LEFT OUTER JOIN - returns all rows from the left table, with matched rows from the right.
    LeftOuter,
    /// RIGHT OUTER JOIN - returns all rows from the right table, with matched rows from the left.
    RightOuter,
    /// FULL OUTER JOIN - returns all rows when there is a match in either table.
    FullOuter,
}

impl Transpile for JoinType {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Inner => fmt.write_str("INNER JOIN"),
            Self::LeftOuter => fmt.write_str("LEFT OUTER JOIN"),
            Self::RightOuter => fmt.write_str("RIGHT OUTER JOIN"),
            Self::FullOuter => fmt.write_str("FULL OUTER JOIN"),
        }
    }
}

impl JoinType {
    /// Returns the reversed join type.
    ///
    /// Swaps left/right orientation while preserving semantics:
    /// - `LeftOuter` ↔ `RightOuter`
    /// - `Inner` and `FullOuter` remain unchanged
    ///
    /// Useful when reversing the order of tables in a join operation.
    #[must_use]
    pub const fn reverse(self) -> Self {
        match self {
            Self::Inner => Self::Inner,
            Self::LeftOuter => Self::RightOuter,
            Self::RightOuter => Self::LeftOuter,
            Self::FullOuter => Self::FullOuter,
        }
    }
}
