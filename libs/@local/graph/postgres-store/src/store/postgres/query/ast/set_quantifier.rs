use core::fmt;

use crate::store::postgres::query::Transpile;

/// `ALL | DISTINCT` — the SQL-standard set quantifier.
///
/// Used by `GROUP BY [ ALL | DISTINCT ]` and the set operations
/// (`{ UNION | INTERSECT | EXCEPT } [ ALL | DISTINCT ]`).
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum SetQuantifier {
    All,
    Distinct,
}

impl Transpile for SetQuantifier {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::All => fmt.write_str("ALL"),
            Self::Distinct => fmt.write_str("DISTINCT"),
        }
    }
}
