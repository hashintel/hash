mod insert;
mod select;
mod window;

use core::fmt;

pub use self::{
    insert::InsertStatementBuilder,
    select::{Distinctness, FromItem, SelectStatement},
    window::WindowStatement,
};
use crate::store::postgres::query::Transpile;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Statement {
    Select(SelectStatement),
}

impl Transpile for Statement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Select(statement) => statement.transpile(fmt),
        }
    }
}

impl From<SelectStatement> for Statement {
    #[inline]
    fn from(statement: SelectStatement) -> Self {
        Self::Select(statement)
    }
}
