//! Store interface for CRUD operations.
//!
//! The traits defined in this module are used in [`Store`] to create, read, update, and delete
//! entries. They form a unified access to the [`Store`], so it's possible to add operations to the
//! [`Store`] without changing the [`Store`] implementation.

use async_trait::async_trait;
use error_stack::Result;

use crate::store::{QueryError, Store};

/// Marker to return the latest version of all records.
#[derive(Copy, Clone, Debug)]
pub struct AllLatest;

/// Read access to a [`Store`].
// TODO: Change the way we are interacting with this trait (or change the trait).
//   With our current design we need to specify a marker, what exactly we want to extract. For some
//   things this is intuitive like a `&VersionedUri`, which will return exactly one type, but for
//   other types, like `&BaseUri` this does not convey the meaning well enough. This could return
//   only the latest version of a type or all types with this URI. This would imply, that we need
//   a marker struct for each meaning, i.e. `Latest<'i, BaseUri>(&'i BaseUri)`. In addition to that,
//   we want to extend our interface to structural querying, so something like an `AST` needs to be
//   aware of the types.
//   As an example why this is bad see the `AllLatest` marker struct.
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
