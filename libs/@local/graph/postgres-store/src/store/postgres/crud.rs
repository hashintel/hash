use core::marker::PhantomData;

use error_stack::{Report, ResultExt as _};
use futures::{Stream, StreamExt as _, TryStreamExt as _};
use hash_graph_store::{
    error::QueryError,
    filter::Filter,
    query::{QueryResult, Read, ReadPaginated, Sorting},
    subgraph::temporal_axes::QueryTemporalAxes,
};
use tokio_postgres::{GenericClient as _, Row};
use tracing::Instrument as _;

use crate::store::{
    AsClient, PostgresStore,
    postgres::query::{PostgresQueryPath, PostgresRecord, PostgresSorting, SelectCompiler},
};

pub struct QueryIndices<R: QueryRecordDecode, S: QueryRecordDecode> {
    record_indices: R::Indices,
    cursor_indices: S::Indices,
}

pub trait QueryRecordDecode {
    type Indices: Send + Sync + 'static;
    type Output;

    fn decode(row: &Row, indices: &Self::Indices) -> Self::Output;
}

// A row which can be used to decode both, a record and a cursor.
pub struct TypedRow<R, C> {
    row: Row,
    record: PhantomData<R>,
    cursor: PhantomData<C>,
}

impl<R, C> From<Row> for TypedRow<R, C> {
    fn from(row: Row) -> Self {
        Self {
            row,
            record: PhantomData,
            cursor: PhantomData,
        }
    }
}

impl<R, S> QueryResult<R, S> for TypedRow<R, S::Cursor>
where
    R: QueryRecordDecode<Output = R>,
    S: Sorting + QueryRecordDecode<Output = S::Cursor>,
{
    type Indices = QueryIndices<R, S>;

    fn decode_record(&self, indices: &Self::Indices) -> R {
        R::decode(&self.row, &indices.record_indices)
    }

    fn decode_cursor(&self, indices: &Self::Indices) -> S::Cursor {
        S::decode(&self.row, &indices.cursor_indices)
    }
}

impl<Cl, A, R, S> ReadPaginated<R, S> for PostgresStore<Cl, A>
where
    Cl: AsClient,
    for<'c> R: PostgresRecord<QueryPath<'c>: PostgresQueryPath>,
    for<'s> S: PostgresSorting<'s, R> + Sync,
    S::Cursor: Send,
    A: Send + Sync,
{
    type QueryResult = TypedRow<R, S::Cursor>;

    type ReadPaginatedStream =
        impl Stream<Item = Result<Self::QueryResult, Report<QueryError>>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter, sorting))]
    #[expect(
        clippy::type_complexity,
        reason = "The complexity comes from the `instrument` macro"
    )]
    async fn read_paginated(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        sorting: &S,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<(Self::ReadPaginatedStream, QueryIndices<R, S>), Report<QueryError>> {
        let cursor_parameters = sorting.encode().change_context(QueryError)?;

        let mut compiler = SelectCompiler::new(temporal_axes, include_drafts);
        if let Some(limit) = limit {
            compiler.set_limit(limit);
        }

        let cursor_indices = sorting.compile(
            &mut compiler,
            cursor_parameters.as_ref(),
            temporal_axes.expect("To use a cursor, temporal axes has to be specified"),
        );

        let record_artifacts = R::parameters();
        let record_indices = R::compile(&mut compiler, &record_artifacts);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();
        let stream = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .instrument(tracing::trace_span!("query"))
            .await
            .change_context(QueryError)?;

        Ok((
            stream
                .map(|row| row.change_context(QueryError))
                .map_ok(TypedRow::from),
            QueryIndices {
                record_indices,
                cursor_indices,
            },
        ))
    }
}

impl<Cl, A, R> Read<R> for PostgresStore<Cl, A>
where
    Cl: AsClient,
    for<'c> R: PostgresRecord<QueryPath<'c>: PostgresQueryPath>,
    A: Send + Sync,
{
    type ReadStream = impl Stream<Item = Result<R, Report<QueryError>>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Result<Self::ReadStream, Report<QueryError>> {
        let mut compiler = SelectCompiler::new(temporal_axes, include_drafts);

        let record_artifacts = R::parameters();
        let record_indices = R::compile(&mut compiler, &record_artifacts);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        Ok(self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .instrument(tracing::trace_span!("query"))
            .await
            .change_context(QueryError)?
            .map(|row| row.change_context(QueryError))
            .map_ok(move |row| R::decode(&row, &record_indices)))
    }

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read_one(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Result<R, Report<QueryError>> {
        let mut compiler = SelectCompiler::new(temporal_axes, include_drafts);

        let record_artifacts = R::parameters();
        let record_indices = R::compile(&mut compiler, &record_artifacts);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        let rows = self
            .as_client()
            .query(&statement, parameters)
            .instrument(tracing::trace_span!("query"))
            .await
            .change_context(QueryError)?;

        match rows.len() {
            1 => Ok(R::decode(&rows[0], &record_indices)),
            len => {
                Err(Report::new(QueryError)
                    .attach_printable(format!("Expected 1 result, got {len}")))
            }
        }
    }
}
