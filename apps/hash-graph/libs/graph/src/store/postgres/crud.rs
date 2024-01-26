use async_trait::async_trait;
use error_stack::{Report, ResultExt};
use futures::{Stream, StreamExt, TryStreamExt};
use tokio_postgres::{GenericClient, Row};

use crate::{
    store::{
        crud::{QueryResult, Read, ReadPaginated, Sorting},
        postgres::query::{PostgresQueryPath, PostgresRecord, PostgresSorting, SelectCompiler},
        query::Filter,
        AsClient, PostgresStore, QueryError,
    },
    subgraph::temporal_axes::QueryTemporalAxes,
};

pub struct QueryArtifacts<R: QueryRecordDecode, S: QueryRecordDecode> {
    record_indices: R::CompilationArtifacts,
    cursor_indices: S::CompilationArtifacts,
}

pub trait QueryRecordDecode {
    type CompilationArtifacts: Send + Sync + 'static;
    type Output;

    fn decode(row: &Row, artifacts: &Self::CompilationArtifacts) -> Self::Output;
}

impl<R, S> QueryResult<R, S> for Row
where
    R: QueryRecordDecode<Output = R>,
    S: Sorting + QueryRecordDecode<Output = S::Cursor>,
{
    type Artifacts = QueryArtifacts<R, S>;

    fn decode_record(&self, indices: &Self::Artifacts) -> R {
        R::decode(self, &indices.record_indices)
    }

    fn decode_cursor(&self, indices: &Self::Artifacts) -> S::Cursor {
        S::decode(self, &indices.cursor_indices)
    }
}

impl<Cl, R, S> ReadPaginated<R, S> for PostgresStore<Cl>
where
    Cl: AsClient,
    for<'c> R: PostgresRecord<QueryPath<'c>: PostgresQueryPath>,
    for<'s> S: PostgresSorting<'s, R> + Sync,
{
    type QueryResult = Row;

    type ReadPaginatedStream =
        impl Stream<Item = Result<Self::QueryResult, Report<QueryError>>> + Send + Sync;

    // #[tracing::instrument(level = "info", skip(self, filter, sorting))]
    async fn read_paginated(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        sorting: &S,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<(Self::ReadPaginatedStream, QueryArtifacts<R, S>), Report<QueryError>> {
        let cursor_parameters = sorting.encode().change_context(QueryError)?;

        let mut compiler = SelectCompiler::new(temporal_axes, include_drafts);
        if let Some(limit) = limit {
            compiler.set_limit(limit);
        }

        let cursor_indices = sorting.compile(
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

        Ok((
            stream.map(|row| row.change_context(QueryError)),
            QueryArtifacts {
                record_indices,
                cursor_indices,
            },
        ))
    }
}

#[async_trait]
impl<Cl, R> Read<R> for PostgresStore<Cl>
where
    Cl: AsClient,
    for<'c> R: PostgresRecord<QueryPath<'c>: PostgresQueryPath>,
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

        let row = self
            .as_client()
            .query_one(&statement, parameters)
            .await
            .change_context(QueryError)?;

        Ok(R::decode(&row, &record_indices))
    }
}
