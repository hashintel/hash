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

use std::{
    convert::identity,
    fmt::{self, Display, Formatter},
};

use error_stack::Context;
use graph_types::knowledge::entity::Entity;
use tokio_postgres::Row;

pub use self::{
    compile::SelectCompiler,
    condition::{Condition, EqualityOperator},
    expression::{
        Constant, Expression, Function, JoinExpression, OrderByExpression, Ordering,
        SelectExpression, WhereExpression, WithExpression,
    },
    statement::{Distinctness, SelectStatement, Statement, WindowStatement},
    table::{
        Alias, AliasedColumn, AliasedTable, Column, ForeignKeyReference, ReferenceTable, Table,
    },
};
use crate::{
    store::{
        crud::{CustomCursor, CustomSorting, Sorting},
        postgres::{crud::QueryRecordDecode, query::table::Relation},
        query::{Parameter, ParameterConversionError, QueryPath},
        Record,
    },
    subgraph::temporal_axes::QueryTemporalAxes,
};

pub trait PostgresRecord: Record + QueryRecordDecode<Output = Self> {
    type CompilationParameters: Send + 'static;

    /// The [`Table`] used for this `Query`.
    fn base_table() -> Table;

    fn parameters() -> Self::CompilationParameters;

    fn compile<'p, 'q: 'p>(
        compiler: &mut SelectCompiler<'p, 'q, Self>,
        paths: &'p Self::CompilationParameters,
    ) -> Self::CompilationArtifacts;
}

/// An absolute path inside of a query pointing to an attribute.
pub trait PostgresQueryPath {
    /// Returns a list of [`Relation`]s required to traverse this path.
    fn relations(&self) -> Vec<Relation>;

    /// The [`Column`] where this path ends.
    fn terminating_column(&self) -> Column;
}

/// Renders the object into a Postgres compatible format.
pub trait Transpile: 'static {
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

pub trait PostgresSorting<'s, R: Record>:
    Sorting + QueryRecordDecode<Output = Self::Cursor>
{
    type CompilationParameters: Send;

    type Error: Context + Send + Sync + 'static;

    fn encode(&self) -> Result<Option<Self::CompilationParameters>, Self::Error>;

    fn compile<'p, 'q: 'p>(
        &'p self,
        compiler: &mut SelectCompiler<'p, 'q, R>,
        parameters: Option<&'p Self::CompilationParameters>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Self::CompilationArtifacts
    where
        's: 'q;
}

impl<R: Record> QueryRecordDecode for CustomSorting<'_, R> {
    type CompilationArtifacts = Vec<usize>;
    type Output = CustomCursor;

    fn decode(row: &Row, indices: &Self::CompilationArtifacts) -> Self::Output {
        CustomCursor {
            values: indices.iter().map(|i| row.get(i)).collect(),
        }
    }
}

impl<'s> PostgresSorting<'s, Entity> for CustomSorting<'s, Entity> {
    type CompilationParameters = Vec<Parameter<'s>>;
    type Error = ParameterConversionError;

    fn encode(&self) -> Result<Option<Self::CompilationParameters>, Self::Error> {
        self.cursor()
            .map(|cursor| {
                self.paths
                    .iter()
                    .zip(&cursor.values)
                    .map(|(path, value)| {
                        // TODO: Figure out why `'static` is required for `Parameter` here (why
                        //       `to_owned` is required).
                        Ok(Parameter::from_value(value, path.expected_type())?.to_owned())
                    })
                    .collect()
            })
            .transpose()
    }

    fn compile<'p, 'q: 'p>(
        &'p self,
        compiler: &mut SelectCompiler<'p, 'q, Entity>,
        parameters: Option<&'p Self::CompilationParameters>,
        _: &QueryTemporalAxes,
    ) -> Self::CompilationArtifacts
    where
        's: 'q,
    {
        if let Some(cursor) = parameters {
            self.paths
                .iter()
                .zip(cursor)
                .map(|(path, parameter)| {
                    let expression = compiler.compile_parameter(parameter).0;
                    compiler.add_cursor_selection(path, identity, expression, Ordering::Ascending)
                })
                .collect()
        } else {
            self.paths
                .iter()
                .map(|path| {
                    compiler.add_distinct_selection_with_ordering(
                        path,
                        Distinctness::Distinct,
                        Some(Ordering::Ascending),
                    )
                })
                .collect()
        }
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

    pub fn max_version_expression() -> Expression {
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
            WindowStatement::partition_by(DataTypeQueryPath::BaseUrl.terminating_column().aliased(
                Alias {
                    condition_index: 0,
                    chain_depth: 0,
                    number: 0,
                },
            )),
        )
    }
}
