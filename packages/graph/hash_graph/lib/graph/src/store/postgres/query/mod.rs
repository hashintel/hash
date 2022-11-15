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

pub use self::{
    compile::SelectCompiler,
    condition::{Condition, EqualityOperator},
    expression::{
        CommonTableExpression, Expression, Function, JoinExpression, OrderByExpression, Ordering,
        SelectExpression, WhereExpression, WithExpression,
    },
    statement::{Distinctness, SelectStatement, Statement, WindowStatement},
    table::{Alias, AliasedColumn, AliasedTable, Table},
};
use crate::store::{
    postgres::query::table::{Column, Relation},
    query::QueryRecord,
};

pub trait PostgresQueryRecord: for<'q> QueryRecord<Path<'q>: Path<'q>> {
    /// The [`Table`] used for this `Query`.
    fn base_table() -> Table;

    /// Default [`Path`]s returned when querying this record.
    fn default_selection_paths() -> &'static [Self::Path<'static>];
}

/// An absolute path inside of a query pointing to an attribute.
pub trait Path<'p> {
    /// Returns a list of [`TableName`]s required to traverse this path.
    fn relations(&self) -> Vec<Relation>;

    /// The [`Column`] where this path ends.
    fn terminating_column(&self) -> Column;
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
        store::postgres::query::{Expression, Function, Path, WindowStatement},
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
                Expression::Column(
                    DataTypeQueryPath::Version
                        .terminating_column()
                        .aliased(None),
                ),
            )))),
            WindowStatement::partition_by(
                DataTypeQueryPath::BaseUri
                    .terminating_column()
                    .aliased(None),
            ),
        )
    }
}
