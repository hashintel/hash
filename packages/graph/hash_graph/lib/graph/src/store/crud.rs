//! Store interface for CRUD operations.
//!
//! The traits defined in this module are used in [`Store`] to create, read, update, and delete
//! entries. They form a unified access to the [`Store`], so it's possible to add operations to the
//! [`Store`] without changing the [`Store`] implementation.
//!
//! [`Store`]: crate::store::Store

use std::collections::hash_map::RawEntryMut;

use async_trait::async_trait;
use error_stack::{ensure, Report, Result};

use crate::{
    store::{query::Filter, QueryError, Record},
    subgraph::Subgraph,
};

/// Read access to a [`Store`].
///
/// [`Store`]: crate::store::Store
// TODO: Use queries, which are passed to the query-endpoint
//   see https://app.asana.com/0/1202805690238892/1202979057056097/f
#[async_trait]
pub trait Read<R: Record + Send>: Sync {
    // TODO: Return a stream of `R` instead
    //   see https://app.asana.com/0/1202805690238892/1202923536131158/f
    /// Returns a value from the [`Store`] specified by the passed `query`.
    ///
    /// [`Store`]: crate::store::Store
    async fn read(&self, query: &Filter<R>) -> Result<Vec<R>, QueryError>;

    #[tracing::instrument(level = "info", skip(self, query))]
    async fn read_one(&self, query: &Filter<R>) -> Result<R, QueryError> {
        let mut records = self.read(query).await?;
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

    /// Looks up a single [`Record`] in the subgraph or reads it from the [`Store`] and inserts it
    /// if it is not yet in the subgraph.
    ///
    /// [`Store`]: crate::store::Store
    async fn read_into_subgraph<'r>(
        &self,
        subgraph: &'r mut Subgraph,
        edition_id: &R::EditionId,
    ) -> Result<&'r R, QueryError> {
        Ok(match R::subgraph_entry(subgraph, edition_id) {
            RawEntryMut::Occupied(entry) => entry.into_mut(),
            RawEntryMut::Vacant(entry) => {
                entry
                    .insert(
                        edition_id.clone(),
                        self.read_one(&R::create_filter_for_edition_id(edition_id))
                            .await?,
                    )
                    .1
            }
        })
    }
}

// TODO: Add remaining CRUD traits (but probably don't implement the `D`-part)
