//! Store interface for CRUD operations.
//!
//! The traits defined in this module are used in [`Store`] to create, read, update, and delete
//! entries. They form a unified access to the [`Store`], so it's possible to add operations to the
//! [`Store`] without changing the [`Store`] implementation.
//!
//! [`Store`]: crate::store::Store

use error_stack::Report;
use futures::{Stream, TryFutureExt as _, TryStreamExt};
use hash_graph_store::{
    error::QueryError,
    filter::{Filter, QueryRecord},
    subgraph::{SubgraphRecord, temporal_axes::QueryTemporalAxes},
};
use tracing::instrument;
use type_system::url::VersionedUrl;

pub trait QueryResult<R, S: Sorting> {
    type Indices: Send;

    fn decode_record(&self, indices: &Self::Indices) -> R;
    fn decode_cursor(&self, indices: &Self::Indices) -> <S as Sorting>::Cursor;
}

pub trait Sorting {
    type Cursor;

    fn cursor(&self) -> Option<&Self::Cursor>;

    fn set_cursor(&mut self, cursor: Self::Cursor);
}

pub struct VersionedUrlSorting {
    pub cursor: Option<VersionedUrl>,
}

impl Sorting for VersionedUrlSorting {
    type Cursor = VersionedUrl;

    fn cursor(&self) -> Option<&Self::Cursor> {
        self.cursor.as_ref()
    }

    fn set_cursor(&mut self, cursor: Self::Cursor) {
        self.cursor = Some(cursor);
    }
}

pub struct ReadParameter<'f, R: QueryRecord, S> {
    filters: Option<&'f Filter<'f, R>>,
    temporal_axes: Option<&'f QueryTemporalAxes>,
    include_drafts: bool,
    sorting: Option<S>,
    limit: Option<usize>,
}

impl<R: QueryRecord> Default for ReadParameter<'_, R, ()> {
    fn default() -> Self {
        Self {
            filters: None,
            temporal_axes: None,
            include_drafts: false,
            sorting: None,
            limit: None,
        }
    }
}

impl<'f, R: QueryRecord, S> ReadParameter<'f, R, S> {
    #[must_use]
    pub const fn filter(mut self, filter: &'f Filter<'f, R>) -> Self {
        self.filters = Some(filter);
        self
    }

    #[must_use]
    pub const fn temporal_axes(mut self, temporal_axes: &'f QueryTemporalAxes) -> Self {
        self.temporal_axes = Some(temporal_axes);
        self
    }

    #[must_use]
    pub const fn include_drafts(mut self) -> Self {
        self.include_drafts = true;
        self
    }
}

impl<'f, R: SubgraphRecord + QueryRecord, S> ReadParameter<'f, R, S> {
    #[must_use]
    pub fn sort_by_vertex_id(self) -> ReadParameter<'f, R, VersionedUrlSorting> {
        ReadParameter {
            filters: self.filters,
            temporal_axes: self.temporal_axes,
            include_drafts: self.include_drafts,
            sorting: Some(VersionedUrlSorting { cursor: None }),
            limit: self.limit,
        }
    }
}

impl<R: QueryRecord> ReadParameter<'_, R, ()> {
    /// # Errors
    ///
    /// Returns an error if reading the records fails.
    pub async fn read(
        &self,
        store: &impl Read<R>,
    ) -> Result<impl Stream<Item = Result<R, Report<QueryError>>>, Report<QueryError>> {
        store
            .read(
                self.filters.unwrap_or(&Filter::All(Vec::new())),
                self.temporal_axes,
                self.include_drafts,
            )
            .await
    }

    /// # Errors
    ///
    /// Returns an error if reading the records fails.
    pub async fn read_vec(&self, store: &impl Read<R>) -> Result<Vec<R>, Report<QueryError>> {
        self.read(store).await?.try_collect().await
    }
}

impl<R: QueryRecord, S: Sorting> ReadParameter<'_, R, S> {
    #[must_use]
    pub const fn limit(mut self, limit: usize) -> Self {
        self.limit = Some(limit);
        self
    }

    #[must_use]
    #[expect(
        clippy::missing_panics_doc,
        reason = "It's not possible to get `S` as parameter without setting `sorting`"
    )]
    pub fn cursor(mut self, cursor: S::Cursor) -> Self {
        self.sorting
            .as_mut()
            .expect("sorting is not set")
            .set_cursor(cursor);
        self
    }
}

/// Read access to a [`Store`].
///
/// [`Store`]: crate::store::Store
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
        filter: &Filter<'_, R>,
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
    #[instrument(level = "info", skip(self, filter, sorting))]
    fn read_paginated_vec(
        &self,
        filter: &Filter<'_, R>,
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
        async move {
            let (stream, artifacts) = self
                .read_paginated(filter, temporal_axes, sorting, limit, include_drafts)
                .await?;
            Ok((stream.try_collect().await?, artifacts))
        }
    }
}

/// Read access to a [`Store`].
///
/// [`Store`]: crate::store::Store
pub trait Read<R: QueryRecord>: Sync {
    type ReadStream: Stream<Item = Result<R, Report<QueryError>>> + Send + Sync;

    fn read(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> impl Future<Output = Result<Self::ReadStream, Report<QueryError>>> + Send;

    #[instrument(level = "info", skip(self, filter))]
    fn read_vec(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> impl Future<Output = Result<Vec<R>, Report<QueryError>>> + Send {
        self.read(filter, temporal_axes, include_drafts)
            .and_then(TryStreamExt::try_collect)
    }

    fn read_one(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> impl Future<Output = Result<R, Report<QueryError>>> + Send;
}

// TODO: Add remaining CRUD traits
