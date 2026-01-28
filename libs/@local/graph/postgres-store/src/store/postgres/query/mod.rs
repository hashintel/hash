#![expect(dead_code, reason = "Work in progress")]

//! Postgres implementation to compile queries.

mod compile;
mod condition;
mod data_type;
mod entity;
mod entity_type;
mod expression;
mod property_masking;
mod property_type;
pub(crate) mod rows;
mod statement;
pub(crate) mod table;

use core::{
    convert::identity,
    error::Error,
    fmt::{self, Display, Formatter},
};

use error_stack::Report;
use hash_graph_store::{
    entity::{EntityQueryCursor, EntityQuerySorting},
    filter::{ParameterConversionError, QueryRecord},
    query::{CursorField, Sorting},
    subgraph::temporal_axes::QueryTemporalAxes,
};
use tokio_postgres::Row;
use type_system::knowledge::{Entity, PropertyValue};

pub use self::{
    compile::{SelectCompiler, SelectCompilerError},
    condition::{Condition, EqualityOperator},
    expression::{
        Constant, Expression, Function, SelectExpression, WhereExpression, WithExpression,
    },
    statement::{
        Distinctness, InsertStatementBuilder, SelectStatement, Statement, WindowStatement,
    },
    table::{Alias, Column, ForeignKeyReference, JsonField, ReferenceTable, Relation, Table},
};
use crate::store::postgres::crud::QueryRecordDecode;

pub trait PostgresRecord: QueryRecord + QueryRecordDecode<Output = Self> {
    type CompilationParameters: Send + 'static;

    /// The [`Table`] used for this `Query`.
    fn base_table() -> Table;

    fn parameters() -> Self::CompilationParameters;

    fn compile<'p, 'q: 'p>(
        compiler: &mut SelectCompiler<'p, 'q, Self>,
        paths: &'p Self::CompilationParameters,
    ) -> Self::Indices;
}

/// An absolute path inside of a query pointing to an attribute.
pub trait PostgresQueryPath: Sized {
    /// Returns a list of [`Relation`]s required to traverse this path.
    fn relations(&self) -> Vec<Relation>;

    /// The [`Column`] where this path ends.
    fn terminating_column(&self) -> (Column, Option<JsonField<'_>>);

    #[expect(unused_variables, reason = "No-op")]
    #[must_use]
    fn label_property_path(inheritance_depth: Option<u32>) -> Option<Self> {
        None
    }
}

/// Renders the object into a Postgres compatible format.
pub trait Transpile {
    /// Renders the value using the given [`Formatter`].
    ///
    /// # Errors
    ///
    /// Returns an error if the value cannot be formatted or written to the formatter.
    fn transpile(&self, fmt: &mut Formatter) -> fmt::Result;

    fn transpile_to_string(&self) -> String {
        struct Transpiler<'a, T: ?Sized>(&'a T);
        impl<T: Transpile + ?Sized> Display for Transpiler<'_, T> {
            fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
                self.0.transpile(fmt)
            }
        }

        Transpiler(self).to_string()
    }
}

pub trait PostgresSorting<'s, R: QueryRecord>:
    Sorting + QueryRecordDecode<Output = Self::Cursor>
{
    type CompilationParameters: Send;

    type Error: Error + Send + Sync + 'static;

    /// Encodes the sorting parameters for use in the query.
    ///
    /// # Errors
    ///
    /// Returns an error if the sorting parameters cannot be encoded.
    fn encode(&'s self) -> Result<Option<Self::CompilationParameters>, Self::Error>;

    /// Compiles the sorting into column selections and ordering expressions.
    ///
    /// # Errors
    ///
    /// Returns an error if the sorting cannot be compiled into valid SQL expressions.
    fn compile<'p, 'q: 'p>(
        &'p self,
        compiler: &mut SelectCompiler<'p, 'q, R>,
        parameters: Option<&'p Self::CompilationParameters>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<Self::Indices, Report<SelectCompilerError>>
    where
        's: 'q;
}

impl<'s> QueryRecordDecode for EntityQuerySorting<'s> {
    type Indices = Vec<usize>;
    type Output = EntityQueryCursor<'s>;

    fn decode(row: &Row, indices: &Self::Indices) -> Self::Output {
        EntityQueryCursor {
            values: indices.iter().map(|i| row.get(i)).collect(),
        }
    }
}

impl<'s, 'e> PostgresSorting<'s, Entity> for EntityQuerySorting<'e>
where
    'e: 's,
{
    type CompilationParameters = ();
    type Error = ParameterConversionError;

    fn encode(&self) -> Result<Option<Self::CompilationParameters>, Self::Error> {
        Ok(Some(()))
    }

    fn compile<'p, 'q: 'p>(
        &'p self,
        compiler: &mut SelectCompiler<'p, 'q, Entity>,
        _: Option<&'p Self::CompilationParameters>,
        _: &QueryTemporalAxes,
    ) -> Result<Self::Indices, Report<SelectCompilerError>>
    where
        's: 'q,
    {
        if let Some(cursor) = self.cursor() {
            self.paths
                .iter()
                .zip(&cursor.values)
                .map(|(sorting_record, parameter)| {
                    let expression = (*parameter != CursorField::Json(PropertyValue::Null))
                        .then(|| compiler.add_parameter(parameter));
                    compiler.add_cursor_selection(
                        &sorting_record.path,
                        identity,
                        expression,
                        sorting_record.ordering,
                        sorting_record.nulls,
                    )
                })
                .collect()
        } else {
            Ok(self
                .paths
                .iter()
                .map(|sorting_record| {
                    compiler.add_distinct_selection_with_ordering(
                        &sorting_record.path,
                        Distinctness::Distinct,
                        Some((sorting_record.ordering, sorting_record.nulls)),
                    )
                })
                .collect())
        }
    }
}

#[cfg(test)]
mod test_helper {
    use hash_graph_store::data_type::DataTypeQueryPath;

    use crate::store::postgres::query::{
        Alias, Expression, Function, PostgresQueryPath as _, WindowStatement,
    };

    pub fn trim_whitespace(string: &str) -> String {
        string.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    pub fn max_version_expression() -> Expression {
        Expression::Window(
            Box::new(Expression::Function(Function::Max(Box::new(
                Expression::ColumnReference(
                    DataTypeQueryPath::Version
                        .terminating_column()
                        .0
                        .aliased(Alias {
                            condition_index: 0,
                            chain_depth: 0,
                            number: 0,
                        }),
                ),
            )))),
            WindowStatement::partition_by(Expression::ColumnReference(
                DataTypeQueryPath::BaseUrl
                    .terminating_column()
                    .0
                    .aliased(Alias {
                        condition_index: 0,
                        chain_depth: 0,
                        number: 0,
                    }),
            )),
        )
    }
}
