#![expect(dead_code, reason = "Work in progress")]

//! Postgres implementation to compile queries.

use std::fmt::{self, Formatter};

use crate::store::postgres::query::database::{Column, Table};

pub mod database;

/// A structural query, which can be compiled into a statement in Postgres.
// TODO: Implement for `DataTypeQuery`, `PropertyTypeQuery`, etc. (not added yet)
pub trait Query {
    type Field: Field;
    type Path: Path;

    /// The table used for this `Query`.
    fn base_table() -> Table;
}

/// A field used in queries.
// TODO: Implement for `DataTypeField`, `PropertyTypeQueryField`, etc. (not added yet)
pub trait Field {
    /// The [`Column`], where this field lives in.
    fn column(&self) -> Column;
}

/// A path used in queries.
// TODO: Implement for `DataTypeQueryPath`, `PropertyTypeQueryPath`, etc. (not added yet)
pub trait Path {
    /// Returns a list of tables required to traverse this path.
    fn tables(&self) -> Vec<Table>;

    /// Returns the [`Column`] where the path ends at.
    fn column(&self) -> Column;
}

/// Renders the object into a Postgres compatible format.
pub trait Render {
    /// Renders the value using the given [`Formatter`].
    fn render(&self, fmt: &mut Formatter) -> fmt::Result;
}
