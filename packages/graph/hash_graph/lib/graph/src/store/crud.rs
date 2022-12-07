//! Store interface for CRUD operations.
//!
//! The traits defined in this module are used in [`Store`] to create, read, update, and delete
//! entries. They form a unified access to the [`Store`], so it's possible to add operations to the
//! [`Store`] without changing the [`Store`] implementation.
//!
//! [`Store`]: crate::store::Store

use async_trait::async_trait;
use error_stack::{ensure, Report, Result};

use crate::store::{
    query::{Filter, QueryRecord},
    QueryError,
};

/// Read access to a [`Store`].
///
/// [`Store`]: crate::store::Store
// TODO: Use queries, which are passed to the query-endpoint
//   see https://app.asana.com/0/1202805690238892/1202979057056097/f
#[async_trait]
pub trait Read<T: QueryRecord + Send>: Sync {
    // TODO: Return a stream of `T` instead
    //   see https://app.asana.com/0/1202805690238892/1202923536131158/f
    /// Returns a value from the [`Store`] specified by the passed `query`.
    ///
    /// [`Store`]: crate::store::Store
    async fn read<'f: 'q, 'q>(&self, query: &'f Filter<'q, T>) -> Result<Vec<T>, QueryError>;

    async fn read_one<'f: 'q, 'q>(&self, query: &'f Filter<'q, T>) -> Result<T, QueryError>
    where
        for<'a> Filter<'a, T>: Sync,
    {
        let mut records = self.read(query).await?;
        ensure!(
            records.len() <= 1,
            Report::new(QueryError).attach_printable(format!(
                "Expected exactly one record to be returned from the query but {} were returned",
                records.len(),
            ))
        );
        let record = records.pop().ok_or_else(|| {
            Report::new(QueryError).attach_printable(
                "Expected exactly one record to be returned from the query but none was returned",
            )
        })?;
        Ok(record)
    }
}

// TODO: Add remaining CRUD traits (but probably don't implement the `D`-part)
