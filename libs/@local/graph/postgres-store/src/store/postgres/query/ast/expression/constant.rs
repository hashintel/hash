use core::fmt;

use crate::store::postgres::query::Transpile;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Constant {
    Null,
    Boolean(bool),
    U32(u32),
    U128(u128),
    /// The JSON `null` literal, distinct from SQL `NULL`.
    ///
    /// Transpiles to `'null'::jsonb`.
    JsonNull,
}

impl From<bool> for Constant {
    fn from(value: bool) -> Self {
        Self::Boolean(value)
    }
}

impl From<u32> for Constant {
    fn from(value: u32) -> Self {
        Self::U32(value)
    }
}

impl Transpile for Constant {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Null => write!(fmt, "NULL"),
            Self::Boolean(value) => fmt.write_str(if *value { "TRUE" } else { "FALSE" }),
            Self::U32(number) => fmt::Display::fmt(number, fmt),
            Self::U128(number) => fmt::Display::fmt(number, fmt),
            Self::JsonNull => fmt.write_str("'null'::jsonb"),
        }
    }
}
