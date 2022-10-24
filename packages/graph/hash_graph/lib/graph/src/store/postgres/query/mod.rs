#![allow(dead_code, reason = "Work in progress")]

//! Postgres implementation to compile queries.

mod compile;
mod condition;
mod data_type;
mod expression;
mod statement;
mod table;

use std::fmt::{self, Display, Formatter};

use postgres_types::ToSql;

pub use self::{
    compile::SelectCompiler,
    condition::{Condition, EqualityOperator},
    data_type::DataTypeQueryField,
    expression::{
        CommonTableExpression, Expression, Function, JoinExpression, SelectExpression,
        WhereExpression, WithExpression,
    },
    statement::{SelectStatement, Statement, WindowStatement},
    table::{Column, ColumnAccess, Table, TableAlias, TableName},
};
use crate::store::query::QueryRecord;

pub trait PostgresQueryRecord<'q>: QueryRecord<Path<'q>: Path> {
    type Field: Field;

    /// The [`Table`] used for this `Query`.
    fn base_table() -> Table;

    /// Default [`Field`]s returned when querying this record.
    fn default_fields() -> &'q [Self::Field];
}

/// A queryable attribute of an element in the graph.
pub trait Field {
    /// The [`TableName`] of the [`Table`] where this field is located.
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

    /// Returns the field if the path is provided by a user.
    ///
    /// One example of a user provided path is [`DataTypeQueryPath::Custom("custom string")`]
    ///
    /// [`DataTypeQueryPath::Custom("custom string")`]: crate::ontology::DataTypeQueryPath::Custom
    fn user_provided_field(&self) -> Option<&(dyn ToSql + Sync)>;
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
    use crate::store::postgres::query::{
        Column, DataTypeQueryField, Expression, Field, Function, Table, WindowStatement,
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
                        name: DataTypeQueryField::Version.table_name(),
                        alias: None,
                    },
                    access: DataTypeQueryField::Version.column_access(),
                }),
            )))),
            WindowStatement::partition_by(Column {
                table: Table {
                    name: DataTypeQueryField::BaseUri.table_name(),
                    alias: None,
                },
                access: DataTypeQueryField::BaseUri.column_access(),
            }),
        )
    }
}
