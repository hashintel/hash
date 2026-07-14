mod insert;
mod select;

use core::fmt;

pub use self::{
    insert::{OnConflict, bulk_insert},
    select::{SelectClause, SelectQuantifier, SelectStatement, SetOperator, SimpleSelect},
};
use crate::store::postgres::query::Transpile;

#[derive(Debug, Clone, PartialEq)]
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
