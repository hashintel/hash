//! Store interface for CRUD operations.
//!
//! The traits defined in this module are used in [`Store`] to create, read, update, and delete
//! entries. They form a unified access to the [`Store`], so it's possible to add operations to the
//! [`Store`] without changing the [`Store`] implementation.
//!
//! [`Store`]: crate::store::Store

use async_trait::async_trait;
use error_stack::{ensure, Report, Result};
use futures::TryStreamExt;

use crate::{
    store::{query::Filter, QueryError, Record},
    subgraph::temporal_axes::QueryTemporalAxes,
};

/// Read access to a [`Store`].
///
/// [`Store`]: crate::store::Store
// TODO: Use queries, which are passed to the query-endpoint
//   see https://app.asana.com/0/1202805690238892/1202979057056097/f
#[async_trait]
pub trait Read<R>: Sync {
    type Record: Record;
    type ReadStream: futures::Stream<Item = Result<R, QueryError>> + Send + Sync;

    /// Returns a value from the [`Store`] specified by the passed `query`.
    ///
    /// [`Store`]: crate::store::Store
    async fn read(
        &self,
        query: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Self::ReadStream, QueryError>;

    async fn read_vec(
        &self,
        query: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Vec<R>, QueryError>
    where
        R: Send,
    {
        self.read(query, temporal_axes).await?.try_collect().await
    }

    #[tracing::instrument(level = "info", skip(self, query))]
    async fn read_one(
        &self,
        query: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<R, QueryError>
    where
        R: Send,
    {
        let mut records = self.read_vec(query, temporal_axes).await?;
        ensure!(
            records.len() <= 1,
            Report::new(QueryError).attach_printable(format!(
                "Expected exactly one record to be returned from the query but {} were returned",
                records.len(),
            ))
        );
        records.pop().ok_or_else(|| {
            Report::new(QueryError).attach_printable(
                "Expected exactly one record to be returned from the query but none was returned",
            )
        })
    }
}

// TODO: Add remaining CRUD traits (but probably don't implement the `D`-part)
