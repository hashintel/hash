//! Store interface for CRUD operations.
//!
//! The traits defined in this module are used in [`Store`] to create, read, update, and delete
//! entries. They form a unified access to the [`Store`], so it's possible to add operations to the
//! [`Store`] without changing the [`Store`] implementation.
//!
//! [`Store`]: crate::store::Store

use std::fmt::Debug;

use async_trait::async_trait;
use error_stack::Result;

use crate::store::QueryError;

/// Read access to a [`Store`].
///
/// [`Store`]: crate::store::Store
// TODO: Use queries, which are passed to the query-endpoint
//   see https://app.asana.com/0/1202805690238892/1202979057056097/f
#[async_trait]
pub trait Read<T: Send>: Sync {
    // TODO: Implement `Valuable` for queries and use them directly
    type Query<'q>: Debug + Sync;

    // TODO: Return a stream of `T` instead
    //   see https://app.asana.com/0/1202805690238892/1202923536131158/f
    /// Returns a value from the [`Store`] specified by the passed `query`.
    ///
    /// [`Store`]: crate::store::Store
    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<T>, QueryError>;

    // TODO: Consider adding additional methods, which defaults to `read` e.g. reading exactly one
}

// TODO: Add remaining CRUD traits (but probably don't implement the `D`-part)
