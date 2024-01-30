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
    borrow::Cow,
    convert::identity,
    error::Error,
    fmt::{self, Display, Formatter},
};

use bytes::BytesMut;
use error_stack::Context;
use graph_types::knowledge::entity::Entity;
use postgres_types::{FromSql, IsNull, ToSql, Type, WasNull};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use temporal_versioning::{TemporalInterval, Timestamp};
use tokio_postgres::Row;
use uuid::Uuid;

pub use self::{
    compile::SelectCompiler,
    condition::{Condition, EqualityOperator},
    expression::{
        Constant, Expression, Function, JoinExpression, OrderByExpression, SelectExpression,
        WhereExpression, WithExpression,
    },
    statement::{Distinctness, SelectStatement, Statement, WindowStatement},
    table::{
        Alias, AliasedColumn, AliasedTable, Column, ForeignKeyReference, ReferenceTable, Table,
    },
};
use crate::{
    store::{
        crud::Sorting,
        knowledge::{EntityQueryCursor, EntityQuerySorting},
        postgres::{crud::QueryRecordDecode, query::table::Relation},
        query::ParameterConversionError,
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

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for OntologyTypeVersion {
    postgres_types::accepts!(INT8);

    fn from_sql(_: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::new(i64::from_sql(&Type::INT8, raw)?.try_into()?))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum CursorField<'a> {
    Bool(bool),
    I32(i32),
    F64(f64),
    #[serde(borrow)]
    String(Cow<'a, str>),
    Timestamp(Timestamp<()>),
    TimeInterval(TemporalInterval<()>),
    Json(serde_json::Value),
    Uuid(Uuid),
}

impl CursorField<'_> {
    pub fn into_owned(self) -> CursorField<'static> {
        match self {
            Self::Bool(value) => CursorField::Bool(value),
            Self::I32(value) => CursorField::I32(value),
            Self::F64(value) => CursorField::F64(value),
            Self::String(value) => CursorField::String(Cow::Owned(value.into_owned())),
            Self::Timestamp(value) => CursorField::Timestamp(value),
            Self::TimeInterval(value) => CursorField::TimeInterval(value),
            Self::Json(value) => CursorField::Json(value),
            Self::Uuid(value) => CursorField::Uuid(value),
        }
    }
}

impl FromSql<'_> for CursorField<'static> {
    tokio_postgres::types::accepts!(
        BOOL,
        INT4,
        FLOAT8,
        TEXT,
        VARCHAR,
        TIMESTAMPTZ,
        TSTZ_RANGE,
        JSONB,
        UUID
    );

    fn from_sql(ty: &Type, raw: &[u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        match *ty {
            Type::BOOL => Ok(Self::Bool(bool::from_sql(ty, raw)?)),
            Type::INT4 => Ok(Self::I32(i32::from_sql(ty, raw)?)),
            Type::FLOAT8 => Ok(Self::F64(f64::from_sql(ty, raw)?)),
            Type::TEXT | Type::VARCHAR => Ok(Self::String(Cow::Owned(String::from_sql(ty, raw)?))),
            Type::TIMESTAMPTZ => Ok(Self::Timestamp(Timestamp::from_sql(ty, raw)?)),
            Type::TSTZ_RANGE => Ok(Self::TimeInterval(TemporalInterval::from_sql(ty, raw)?)),
            Type::JSONB => Ok(Self::Json(serde_json::Value::from_sql(ty, raw)?)),
            Type::UUID => Ok(Self::Uuid(Uuid::from_sql(ty, raw)?)),
            _ => Err(format!("Unsupported type: {ty}").into()),
        }
    }

    fn from_sql_null(ty: &Type) -> Result<Self, Box<dyn Error + Sync + Send>> {
        match *ty {
            Type::JSONB => Ok(Self::Json(serde_json::Value::Null)),
            _ => Err(Box::new(WasNull)),
        }
    }
}

impl ToSql for CursorField<'_> {
    tokio_postgres::types::accepts!(
        BOOL,
        INT4,
        FLOAT8,
        TEXT,
        VARCHAR,
        TIMESTAMPTZ,
        TSTZ_RANGE,
        JSONB,
        UUID
    );

    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        match self {
            Self::Bool(value) => value.to_sql(ty, out),
            Self::I32(value) => value.to_sql(ty, out),
            Self::F64(value) => value.to_sql(ty, out),
            Self::String(value) => value.to_sql(ty, out),
            Self::Timestamp(value) => value.to_sql(ty, out),
            Self::TimeInterval(value) => value.to_sql(ty, out),
            Self::Json(value) => value.to_sql(ty, out),
            Self::Uuid(value) => value.to_sql(ty, out),
        }
    }
}

impl<'s> QueryRecordDecode for EntityQuerySorting<'s> {
    type CompilationArtifacts = Vec<usize>;
    type Output = EntityQueryCursor<'s>;

    fn decode(row: &Row, indices: &Self::CompilationArtifacts) -> Self::Output {
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
    ) -> Self::CompilationArtifacts
    where
        's: 'q,
    {
        if let Some(cursor) = self.cursor() {
            self.paths
                .iter()
                .zip(&cursor.values)
                .map(|(sorting_record, parameter)| {
                    let expression = (*parameter != CursorField::Json(Value::Null))
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
            self.paths
                .iter()
                .map(|sorting_record| {
                    compiler.add_distinct_selection_with_ordering(
                        &sorting_record.path,
                        Distinctness::Distinct,
                        Some((sorting_record.ordering, sorting_record.nulls)),
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
