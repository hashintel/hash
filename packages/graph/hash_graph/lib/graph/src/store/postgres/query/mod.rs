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
    Record,
};

pub trait PostgresRecord: for<'p> Record<QueryPath<'p>: PostgresQueryPath> {
    /// The [`Table`] used for this `Query`.
    fn base_table() -> Table;
}

/// An absolute path inside of a query pointing to an attribute.
pub trait PostgresQueryPath {
    /// Returns a list of [`Relation`]s required to traverse this path.
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
        store::postgres::query::{Alias, Expression, Function, PostgresQueryPath, WindowStatement},
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
            Box::new(Expression::Function(Function::Max(Box::new(
                Expression::Column(DataTypeQueryPath::Version.terminating_column().aliased(
                    Alias {
                        condition_index: 0,
                        chain_depth: 0,
                        number: 0,
                    },
                )),
            )))),
            WindowStatement::partition_by(DataTypeQueryPath::BaseUri.terminating_column().aliased(
                Alias {
                    condition_index: 0,
                    chain_depth: 0,
                    number: 0,
                },
            )),
        )
    }
}
