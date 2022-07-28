//! Store interface for CRUD operations.
//!
//! The traits defined in this module are used in [`Store`] to create, read, update, and delete
//! entries. They form a unified access to the [`Store`], so it's possible to add operations to the
//! [`Store`] without changing the [`Store`] implementation.

use async_trait::async_trait;
use error_stack::Result;

use crate::store::{QueryError, Store};

/// Read access to a [`Store`].
#[async_trait]
pub trait Read<'i, I: Send + 'i, T>: Store {
    /// Output returned when getting the value by the identifier `I`.
    type Output;

    /// Returns a value from the [`Store`] specified by `identifier`.
    async fn get(&self, identifier: I) -> Result<Self::Output, QueryError>
    where
        'i: 'async_trait;
}

// TODO: Add remaining CRUD traits (but probably don't implement the `D`-part)
