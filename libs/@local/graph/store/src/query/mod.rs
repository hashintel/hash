pub use self::{
    ordering::{NullOrdering, Ordering, Sorting, VersionedUrlSorting},
    pagination::CursorField,
};

mod ordering;
mod pagination;

use error_stack::Report;
use futures::{Stream, TryFutureExt as _, TryStreamExt};
use tracing::Instrument as _;

use crate::{
    error::QueryError,
    filter::{Filter, QueryRecord},
    subgraph::temporal_axes::QueryTemporalAxes,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum ConflictBehavior {
    /// If a conflict is detected, the operation will fail.
    Fail,
    /// If a conflict is detected, the operation will be skipped.
    Skip,
}

pub trait QueryResult<R, S: Sorting> {
    type Indices: Send;

    fn decode_record(&self, indices: &Self::Indices) -> R;
    fn decode_cursor(&self, indices: &Self::Indices) -> <S as Sorting>::Cursor;
}

/// Paginated read access to a store.
pub trait ReadPaginated<R: QueryRecord, S: Sorting + Sync>: Read<R> {
    type QueryResult: QueryResult<R, S> + Send;

    type ReadPaginatedStream: Stream<Item = Result<Self::QueryResult, Report<QueryError>>>
        + Send
        + Sync;

    #[expect(
        clippy::type_complexity,
        reason = "simplification of type would lead to more unreadable code"
    )]
    fn read_paginated(
        &self,
        filters: &[Filter<'_, R>],
        temporal_axes: Option<&QueryTemporalAxes>,
        sorting: &S,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> impl Future<
        Output = Result<
            (
                Self::ReadPaginatedStream,
                <Self::QueryResult as QueryResult<R, S>>::Indices,
            ),
            Report<QueryError>,
        >,
    > + Send;

    #[expect(
        clippy::type_complexity,
        reason = "simplification of type would lead to more unreadable code"
    )]
    #[tracing::instrument(level = "debug", skip(self, filters, sorting))]
    fn read_paginated_vec(
        &self,
        filters: &[Filter<'_, R>],
        temporal_axes: Option<&QueryTemporalAxes>,
        sorting: &S,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> impl Future<
        Output = Result<
            (
                Vec<Self::QueryResult>,
                <Self::QueryResult as QueryResult<R, S>>::Indices,
            ),
            Report<QueryError>,
        >,
    > + Send {
        self.read_paginated(filters, temporal_axes, sorting, limit, include_drafts)
            .and_then(|(stream, indices)| {
                stream
                    .try_collect::<Vec<_>>()
                    .map_ok(|records| (records, indices))
            })
            .in_current_span()
    }
}

/// Read access to a store.
pub trait Read<R: QueryRecord>: Sync {
    type ReadStream: Stream<Item = Result<R, Report<QueryError>>> + Send + Sync;

    fn read(
        &self,
        filters: &[Filter<'_, R>],
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> impl Future<Output = Result<Self::ReadStream, Report<QueryError>>> + Send;

    #[tracing::instrument(level = "debug", skip(self, filters))]
    fn read_vec(
        &self,
        filters: &[Filter<'_, R>],
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> impl Future<Output = Result<Vec<R>, Report<QueryError>>> + Send {
        self.read(filters, temporal_axes, include_drafts)
            .and_then(TryStreamExt::try_collect)
            .in_current_span()
    }

    fn read_one(
        &self,
        filters: &[Filter<'_, R>],
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> impl Future<Output = Result<R, Report<QueryError>>> + Send;
}

// TODO: Add remaining CRUD traits
