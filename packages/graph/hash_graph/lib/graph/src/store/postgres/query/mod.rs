#![allow(dead_code, reason = "Work in progress")]

//! Postgres implementation to compile queries.

mod compile;
mod condition;
mod data_type;
mod entity;
mod entity_type;
mod expression;
mod property_type;
mod statement;
mod table;

use std::fmt::{self, Display, Formatter};

use postgres_types::ToSql;

pub use self::{
    compile::SelectCompiler,
    condition::{Condition, EqualityOperator},
    expression::{
        CommonTableExpression, Expression, Function, JoinExpression, OrderByExpression, Ordering,
        Relation, SelectExpression, WhereExpression, WithExpression,
    },
    statement::{Distinctness, SelectStatement, Statement, WindowStatement},
    table::{Column, ColumnAccess, Table, TableAlias, TableName},
};
use crate::store::query::QueryRecord;

pub trait PostgresQueryRecord<'q>: QueryRecord<Path<'q>: Path> {
    /// The [`Table`] used for this `Query`.
    fn base_table() -> Table;

    /// Default [`Path`]s returned when querying this record.
    fn default_selection_paths() -> &'q [Self::Path<'q>];
}

/// An absolute path inside of a query pointing to an attribute.
pub trait Path {
    /// Returns a list of [`TableName`]s required to traverse this path.
    fn relations(&self) -> Vec<Relation>;

    /// The [`TableName`] that marks the end of the path.
    fn terminating_table_name(&self) -> TableName;

    /// How to access the column inside of [`terminating_table_name()`] where this path ends.
    ///
    /// [`terminating_table_name()`]: Self::terminating_table_name
    fn column_access(&self) -> ColumnAccess;

    /// Returns the paths if the path is provided by a user.
    ///
    /// One example of a user provided path are properties of an [`Entity`]
    ///
    /// [`Entity`]: crate::knowledge::Entity
    fn user_provided_path(&self) -> Option<&(dyn ToSql + Sync)>;
}

/// Renders the object into a Postgres compatible format.
pub trait Transpile {
    /// Renders the value using the given [`Formatter`].
    fn transpile(&self, fmt: &mut Formatter) -> fmt::Result;

    fn transpile_to_string(&self) -> String {
        struct Transpiler<'a, T: ?Sized>(&'a T);
        impl<T: Transpile + ?Sized> Display for Transpiler<'_, T> {
            fn fmt(&self, fmt: &mut Formatter<'_>) -> std::fmt::Result {
                self.0.transpile(fmt)
            }
        }

        Transpiler(self).to_string()
    }
}

#[cfg(test)]
mod test_helper {
    use crate::{
        ontology::DataTypeQueryPath,
        store::postgres::query::{Column, Expression, Function, Path, Table, WindowStatement},
    };

    pub fn trim_whitespace(string: impl Into<String>) -> String {
        string
            .into()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }

    pub fn max_version_expression() -> Expression<'static> {
        Expression::Window(
            Box::new(Expression::Function(Box::new(Function::Max(
                Expression::Column(Column {
                    table: Table {
                        name: DataTypeQueryPath::Version.terminating_table_name(),
                        alias: None,
                    },
                    access: DataTypeQueryPath::Version.column_access(),
                }),
            )))),
            WindowStatement::partition_by(Column {
                table: Table {
                    name: DataTypeQueryPath::BaseUri.terminating_table_name(),
                    alias: None,
                },
                access: DataTypeQueryPath::BaseUri.column_access(),
            }),
        )
    }
}
