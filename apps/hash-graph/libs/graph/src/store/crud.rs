//! Store interface for CRUD operations.
//!
//! The traits defined in this module are used in [`Store`] to create, read, update, and delete
//! entries. They form a unified access to the [`Store`], so it's possible to add operations to the
//! [`Store`] without changing the [`Store`] implementation.
//!
//! [`Store`]: crate::store::Store

use async_trait::async_trait;
use error_stack::Result;
use futures::{Stream, TryStreamExt};
use tokio_postgres::Row;

use crate::{
    store::{query::Filter, QueryError, Record},
    subgraph::temporal_axes::QueryTemporalAxes,
};

pub trait QueryCompiler<'p> {
    type ResultSet;
}

pub trait QueryRecordEncode {
    type CompilationParameters<'p>: Send
    where
        Self: 'p;

    fn encode(&self) -> Self::CompilationParameters<'_>;
}

pub trait QueryRecordDecode<Q> {
    type CompilationArtifacts: Copy + Send + Sync + 'static;

    fn decode(query_result: &Q, artifacts: Self::CompilationArtifacts) -> Self;
}

pub trait Cursor<'c, C>: QueryRecordEncode + QueryRecordDecode<C::ResultSet>
where
    C: QueryCompiler<'c>,
{
    fn compile<'p: 'c>(
        compiler: &mut C,
        parameters: Option<&'c Self::CompilationParameters<'p>>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Self::CompilationArtifacts;
}

/// A record which is queried for.
///
/// To create a record, three steps are necessary:
///
///   1. As a preparation, the [`QueryRecord::parameters`] are retrieved. This is required as often
///      the parameters are used for the compilation step but the parameters need to outlive
///      compilation.
///   2. Compiling the query using the [`CompilationParameters`] and the [`SelectCompiler`]. This
///      results in [`CompilationArtifacts`], which are used later to decode the query result.
///   3. After a query has been made, the query result is decoded using the [`CompilationArtifacts`]
///      and the query result `Q`.
///
/// [`CompilationParameters`]: Self::CompilationParameters
/// [`CompilationArtifacts`]: Self::CompilationArtifacts
pub trait QueryRecord<'c, C>: Record + QueryRecordDecode<C::ResultSet>
where
    C: QueryCompiler<'c>,
{
    type CompilationParameters: Send + 'static;

    fn parameters() -> Self::CompilationParameters;

    fn compile<'p: 'c>(
        compiler: &mut C,
        paths: &'p Self::CompilationParameters,
    ) -> Self::CompilationArtifacts;
}

pub trait QueryResult {
    type Record;
    type Cursor;

    fn decode_record(&self) -> Self::Record;
    fn decode_cursor(&self) -> Self::Cursor;
}

pub struct PostgresQueryResult<R, C>
where
    R: QueryRecordDecode<Row>,
    C: QueryRecordDecode<Row>,
{
    pub query_result: Row,
    pub record_artifacts: R::CompilationArtifacts,
    pub cursor_artifacts: C::CompilationArtifacts,
}

impl<R, C> QueryResult for PostgresQueryResult<R, C>
where
    R: QueryRecordDecode<Row>,
    C: QueryRecordDecode<Row>,
{
    type Cursor = C;
    type Record = R;

    fn decode_record(&self) -> Self::Record {
        R::decode(&self.query_result, self.record_artifacts)
    }

    fn decode_cursor(&self) -> Self::Cursor {
        C::decode(&self.query_result, self.cursor_artifacts)
    }
}

/// Read access to a [`Store`].
///
/// [`Store`]: crate::store::Store
#[async_trait]
pub trait ReadPaginated<R: Record, C = <R as Record>::VertexId>: Read<R> {
    type QueryResultSet;
    type QueryResult: QueryResult<Record = R, Cursor = C> + Send;

    type ReadPaginatedStream: Stream<Item = Result<Self::QueryResult, QueryError>> + Send + Sync;

    async fn read_paginated(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        cursor: Option<&C>,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<Self::ReadPaginatedStream, QueryError>
    where
        C: QueryRecordDecode<Self::QueryResultSet> + Sync;

    async fn read_paginated_vec(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        cursor: Option<&C>,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<Vec<Self::QueryResult>, QueryError>
    where
        C: QueryRecordDecode<Self::QueryResultSet> + Sync,
    {
        self.read_paginated(filter, temporal_axes, cursor, limit, include_drafts)
            .await?
            .try_collect()
            .await
    }
}

/// Read access to a [`Store`].
///
/// [`Store`]: crate::store::Store
#[async_trait]
pub trait Read<R: Record>: Sync {
    type ReadStream: Stream<Item = Result<R, QueryError>> + Send + Sync;

    async fn read(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Result<Self::ReadStream, QueryError>;

    async fn read_vec(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Result<Vec<R>, QueryError> {
        self.read(filter, temporal_axes, include_drafts)
            .await?
            .try_collect()
            .await
    }

    async fn read_one(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Result<R, QueryError>;
}

// TODO: Add remaining CRUD traits
