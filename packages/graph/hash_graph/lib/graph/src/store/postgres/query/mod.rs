#![allow(dead_code, reason = "Work in progress")]

//! Postgres implementation to compile queries.

mod condition;
mod data_type;
pub mod database;

use std::fmt::{self, Formatter};

pub use self::data_type::DataTypeQueryField;
use crate::store::{
    postgres::query::database::{ColumnAccess, TableName},
    query::QueryRecord,
};

pub trait PostgresQueryRecord<'q>: QueryRecord<Path<'q>: Path> {
    type Field: Field;

    /// The [`TableName`] used for this `Query`.
    fn base_table() -> TableName;
}

/// A queryable attribute of an element in the [`graph`].
///
/// [`graph`]: crate::graph
pub trait Field {
    /// The [`TableName`] of the [`Table`] where this field is located.
    ///
    /// [`Table`]: database::Table
    fn table_name(&self) -> TableName;

    /// The way to access the column inside of [`table_name()`] where this field is located.
    ///
    /// [`table_name()`]: Self::table_name
    fn column_access(&self) -> ColumnAccess;
}

/// An absolute path inside of a query pointing to a [`Field`]
pub trait Path {
    /// Returns a list of [`TableName`]s required to traverse this path.
    fn tables(&self) -> Vec<TableName>;

    /// The [`TableName`] that marks the end of the path.
    fn terminating_table_name(&self) -> TableName;

    /// How to access the column inside of [`terminating_table_name()`] where this path ends.
    ///
    /// [`terminating_table_name()`]: Self::terminating_table_name
    fn column_access(&self) -> ColumnAccess;
}

/// Renders the object into a Postgres compatible format.
pub trait Transpile {
    /// Renders the value using the given [`Formatter`].
    fn transpile(&self, fmt: &mut Formatter) -> fmt::Result;
}

#[cfg(test)]
mod test_helper {
    use std::fmt;

    use crate::store::postgres::query::Transpile;

    pub fn transpile<R: Transpile>(value: &R) -> String {
        struct Transpiler<'r, R>(&'r R);
        impl<R: Transpile> fmt::Display for Transpiler<'_, R> {
            fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
                self.0.transpile(fmt)
            }
        }
        Transpiler(value).to_string()
    }
}
