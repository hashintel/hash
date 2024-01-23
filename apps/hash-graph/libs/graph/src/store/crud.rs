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

use crate::{
    store::{query::Filter, QueryError, Record},
    subgraph::temporal_axes::QueryTemporalAxes,
};

pub trait QueryRecordDecode<Q> {
    type CompilationArtifacts: Copy + Send + Sync + 'static;
    type Output;

    fn decode(query_result: &Q, artifacts: Self::CompilationArtifacts) -> Self::Output;
}

pub trait QueryResult {
    type Record;
    type Sorting: Sorting;

    fn decode_record(&self) -> Self::Record;
    fn decode_cursor(&self) -> <Self::Sorting as Sorting>::Cursor;
}

pub trait Sorting {
    type Cursor;

    fn cursor(&self) -> Option<&Self::Cursor>;

    fn set_cursor(&mut self, cursor: Self::Cursor);
}

pub struct VertexIdSorting<R: Record> {
    pub cursor: Option<R::VertexId>,
}

impl<R: Record> Sorting for VertexIdSorting<R> {
    type Cursor = R::VertexId;

    fn cursor(&self) -> Option<&Self::Cursor> {
        self.cursor.as_ref()
    }

    fn set_cursor(&mut self, cursor: Self::Cursor) {
        self.cursor = Some(cursor);
    }
}

#[expect(
    dead_code,
    reason = "https://linear.app/hash/issue/H-1440/implement-sorting-for-subgraph-roots"
)]
pub struct CustomSorting<'p, R: Record> {
    keys: Vec<R::QueryPath<'p>>,
    cursor: Option<CustomCursor>,
}

#[expect(
    dead_code,
    reason = "https://linear.app/hash/issue/H-1440/implement-sorting-for-subgraph-roots"
)]
pub struct CustomCursor {
    values: Vec<serde_json::Value>,
}

impl<R: Record> Sorting for CustomSorting<'_, R> {
    type Cursor = CustomCursor;

    fn cursor(&self) -> Option<&Self::Cursor> {
        self.cursor.as_ref()
    }

    fn set_cursor(&mut self, cursor: Self::Cursor) {
        self.cursor = Some(cursor);
    }
}

pub struct ReadParameter<'f, R: Record, S> {
    filters: Option<&'f Filter<'f, R>>,
    temporal_axes: Option<&'f QueryTemporalAxes>,
    include_drafts: bool,
    sorting: Option<S>,
    limit: Option<usize>,
}

impl<'f, R: Record> Default for ReadParameter<'f, R, ()> {
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

impl<'f, R: Record, S> ReadParameter<'f, R, S> {
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

    #[must_use]
    pub fn sort_by_vertex_id(self) -> ReadParameter<'f, R, VertexIdSorting<R>> {
        ReadParameter {
            filters: self.filters,
            temporal_axes: self.temporal_axes,
            include_drafts: self.include_drafts,
            sorting: Some(VertexIdSorting { cursor: None }),
            limit: self.limit,
        }
    }

    #[must_use]
    pub fn sort_by_keys<'p>(
        self,
        keys: impl IntoIterator<Item = R::QueryPath<'p>>,
    ) -> ReadParameter<'f, R, CustomSorting<'p, R>> {
        ReadParameter {
            filters: self.filters,
            temporal_axes: self.temporal_axes,
            include_drafts: self.include_drafts,
            sorting: Some(CustomSorting {
                keys: keys.into_iter().collect(),
                cursor: None,
            }),
            limit: self.limit,
        }
    }
}

impl<'f, R: Record> ReadParameter<'f, R, ()> {
    /// # Errors
    ///
    /// Returns an error if reading the records fails.
    pub async fn read(
        &self,
        store: &impl Read<R>,
    ) -> Result<impl Stream<Item = Result<R, QueryError>>, QueryError> {
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
    pub async fn read_vec(&self, store: &impl Read<R>) -> Result<Vec<R>, QueryError> {
        self.read(store).await?.try_collect().await
    }
}

impl<'f, R: Record, S: Sorting> ReadParameter<'f, R, S> {
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

impl<'f, R: Record, S: Sorting + Sync> ReadParameter<'f, R, S> {
    /// # Errors
    ///
    /// Returns an error if reading the records fails.
    pub async fn read_paginated(
        &self,
        store: &impl ReadPaginated<R, S>,
    ) -> Result<
        impl Stream<Item = Result<impl QueryResult<Record = R, Sorting = S>, QueryError>>,
        QueryError,
    > {
        store
            .read_paginated(
                self.filters.unwrap_or(&Filter::All(Vec::new())),
                self.temporal_axes,
                self.sorting.as_ref(),
                self.limit,
                self.include_drafts,
            )
            .await
    }

    /// # Errors
    ///
    /// Returns an error if reading the records fails.
    pub async fn read_paginated_vec(
        &self,
        store: &impl ReadPaginated<R, S>,
    ) -> Result<Vec<impl QueryResult<Record = R, Sorting = S>>, QueryError> {
        self.read_paginated(store).await?.try_collect().await
    }
}

/// Read access to a [`Store`].
///
/// [`Store`]: crate::store::Store
#[async_trait]
pub trait ReadPaginated<R: Record, S: Sorting + Sync = VertexIdSorting<R>>: Read<R> {
    type QueryResultSet;
    type QueryResult: QueryResult<Record = R, Sorting = S> + Send;

    type ReadPaginatedStream: Stream<Item = Result<Self::QueryResult, QueryError>> + Send + Sync;

    async fn read_paginated(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        sorting: Option<&S>,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<Self::ReadPaginatedStream, QueryError>;

    async fn read_paginated_vec(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        sorting: Option<&S>,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<Vec<Self::QueryResult>, QueryError> {
        self.read_paginated(filter, temporal_axes, sorting, limit, include_drafts)
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
