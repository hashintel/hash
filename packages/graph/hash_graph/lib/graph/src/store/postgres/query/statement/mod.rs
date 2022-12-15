mod select;
mod window;

use std::fmt;

pub use self::{
    select::{Distinctness, SelectStatement},
    window::WindowStatement,
};
use crate::store::postgres::query::Transpile;

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Statement<'p> {
    Select(SelectStatement<'p>),
}

impl Transpile for Statement<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Statement::Select(statement) => statement.transpile(fmt),
        }
    }
}

impl<'p> From<SelectStatement<'p>> for Statement<'p> {
    #[inline]
    fn from(statement: SelectStatement<'p>) -> Self {
        Self::Select(statement)
    }
}
