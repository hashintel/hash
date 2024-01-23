use async_trait::async_trait;
use error_stack::{Report, ResultExt};
use futures::{Stream, StreamExt, TryStreamExt};
use tokio_postgres::{GenericClient, Row};

use crate::{
    store::{
        crud::{QueryRecordDecode, QueryResult, Read, ReadPaginated, Sorting},
        postgres::query::{
            PostgresQueryPath, PostgresRecord, PostgresSorting, QueryRecord, QueryRecordEncode,
            SelectCompiler,
        },
        query::Filter,
        AsClient, PostgresStore, QueryError,
    },
    subgraph::temporal_axes::QueryTemporalAxes,
};

pub struct PostgresQueryResult<R, S>
where
    R: QueryRecordDecode<Row>,
    S: QueryRecordDecode<Row>,
{
    pub query_result: Row,
    pub record_artifacts: R::CompilationArtifacts,
    pub cursor_artifacts: S::CompilationArtifacts,
}

impl<R, S> QueryResult for PostgresQueryResult<R, S>
where
    R: QueryRecordDecode<Row, Output = R>,
    S: Sorting + QueryRecordDecode<Row, Output = S::Cursor>,
{
    type Record = R;
    type Sorting = S;

    fn decode_record(&self) -> R {
        R::decode(&self.query_result, self.record_artifacts)
    }

    fn decode_cursor(&self) -> S::Cursor {
        S::decode(&self.query_result, self.cursor_artifacts)
    }
}

#[async_trait]
impl<Cl, R, S> ReadPaginated<R, S> for PostgresStore<Cl>
where
    Cl: AsClient,
    for<'c> R: QueryRecord + PostgresRecord<QueryPath<'c>: PostgresQueryPath>,
    S: PostgresSorting<R> + Send + Sync + 'static,
    S::Cursor: QueryRecordEncode,
{
    type QueryResult = PostgresQueryResult<R, S>;
    type QueryResultSet = Row;

    type ReadPaginatedStream =
        impl Stream<Item = Result<Self::QueryResult, Report<QueryError>>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter, sorting))]
    async fn read_paginated(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        sorting: Option<&S>,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<Self::ReadPaginatedStream, Report<QueryError>> {
        let cursor_parameters = sorting
            .and_then(Sorting::cursor)
            .map(QueryRecordEncode::encode);

        let mut compiler = SelectCompiler::new(temporal_axes, include_drafts);
        if let Some(limit) = limit {
            compiler.set_limit(limit);
        }

        let cursor_indices = S::compile(
            &mut compiler,
            #[allow(clippy::unwrap_used)]
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
            .await
            .change_context(QueryError)?;

        Ok(stream
            .map(|row| row.change_context(QueryError))
            .map_ok(move |row| PostgresQueryResult {
                query_result: row,
                record_artifacts: record_indices,
                cursor_artifacts: cursor_indices,
            }))
    }
}

#[async_trait]
impl<Cl, R> Read<R> for PostgresStore<Cl>
where
    Cl: AsClient,
    for<'c> R: QueryRecord + PostgresRecord<QueryPath<'c>: PostgresQueryPath>,
{
    type ReadStream = impl Stream<Item = Result<R, Report<QueryError>>> + Send + Sync;

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
            .await
            .change_context(QueryError)?
            .map(|row| row.change_context(QueryError))
            .map_ok(move |row| R::decode(&row, record_indices)))
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

        let row = self
            .as_client()
            .query_one(&statement, parameters)
            .await
            .change_context(QueryError)?;

        Ok(R::decode(&row, record_indices))
    }
}
