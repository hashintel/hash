//! Store interface for CRUD operations.
//!
//! The traits defined in this module are used in [`Store`] to create, read, update, and delete
//! entries. They form a unified access to the [`Store`], so it's possible to add operations to the
//! [`Store`] without changing the [`Store`] implementation.

use std::fmt::Debug;
use async_trait::async_trait;
use error_stack::Result;

use crate::store::QueryError;

/// Read access to a [`Store`].
#[async_trait]
pub trait Read<T: Send>: Sync {
    // TODO: Implement `Valuable` for queries and use them directly
    type Query<'q>: Debug + Sync;

    /// Returns a value from the [`Store`] specified by `identifier`.
    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<T>, QueryError>;
}

// TODO: Add remaining CRUD traits (but probably don't implement the `D`-part)
