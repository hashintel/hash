#![allow(dead_code, reason = "Work in progress")]

//! Postgres implementation to compile queries.

mod data_type;
pub mod database;

use std::fmt::{self, Formatter};

pub use self::data_type::DataTypeQueryField;
use crate::store::{
    postgres::query::database::{ColumnAccess, TableName},
    query::QueryRecord,
};

/// A structural query, which can be compiled into a statement in Postgres.
pub trait Query {
    type Field: Field;
    type Record: QueryRecord;

    /// The [`TableName`] used for this `Query`.
    fn base_table() -> TableName;
}

/// An attribute of an ontology type or a knowledge element.
pub trait Field {
    /// The [`TableName`], where this field lives in.
    fn table_name(&self) -> TableName;

    /// The way, how to access the column inside of [`table_name()`] where this field lives in.
    ///
    /// [`table_name()`]: Self::table_name
    fn column_access(&self) -> ColumnAccess;
}

/// An absolute path to a [`Field`].
pub trait Path {
    /// Returns a list of [`TableName`]s required to traverse this path.
    fn tables(&self) -> Vec<TableName>;

    /// The [`TableName`], where this path ends at.
    fn table_name(&self) -> TableName;

    /// The way, how to access the column inside of [`table_name()`] where this path ends at.
    ///
    /// [`table_name()`]: Self::table_name
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
