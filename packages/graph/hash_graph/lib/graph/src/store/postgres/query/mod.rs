#![allow(dead_code, reason = "Work in progress")]

//! Postgres implementation to compile queries.

pub mod database;

use std::fmt::{self, Formatter};

use crate::store::{
    postgres::query::database::{Column, Table},
    query::QueryRecord,
};

/// A structural query, which can be compiled into a statement in Postgres.
// TODO: Implement for `ReadQuery<DataType>`, `ReadQuery<PropertyType>`, etc. when associated types
//       are implemented
pub trait Query {
    type Field: Field;
    type Record: QueryRecord;

    /// The [`Table`] used for this `Query`.
    fn base_table() -> Table;
}

/// An attribute of an ontology type or a knowledge element.
// TODO: Implement for `DataTypeField`, `PropertyTypeQueryField`, etc. (not added yet)
pub trait Field {
    /// The [`Column`] which contains this `Field`.
    fn column(&self) -> Column;
}

/// An absolute path to a [`Field`].
// TODO: Implement for `DataTypeQueryPath`, `PropertyTypeQueryPath`, etc. (not added yet)
pub trait Path {
    /// Returns a list of [`Table`]s required to traverse this path.
    fn tables(&self) -> Vec<Table>;

    /// Returns the [`Column`] where the path ends at.
    fn column(&self) -> Column;
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
