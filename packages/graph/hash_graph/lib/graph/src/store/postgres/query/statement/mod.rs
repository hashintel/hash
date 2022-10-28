mod select;
mod window;

use std::fmt;

pub use self::{
    select::{Destinctness, SelectStatement},
    window::WindowStatement,
};
use crate::store::postgres::query::Transpile;

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Statement<'q> {
    Select(SelectStatement<'q>),
}

impl Transpile for Statement<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Statement::Select(statement) => statement.transpile(fmt),
        }
    }
}

impl<'q> From<SelectStatement<'q>> for Statement<'q> {
    #[inline]
    fn from(statement: SelectStatement<'q>) -> Self {
        Self::Select(statement)
    }
}
