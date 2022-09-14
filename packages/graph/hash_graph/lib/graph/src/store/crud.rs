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

/// Depth used to read referenced records when querying a rooted subgraph.
///
/// Records may have references to other records, e.g. a [`PropertyType`] may reference other
/// [`PropertyType`]s or [`DataType`]s. When a record is requested, a depth for each referenced
/// record has to be provided. The depth specify, how far references are resolved when returning a
/// rooted subgraph, a depth of `0` means, that no further references are returned.
///
/// # Example
///
/// When reading a [`PropertyType`], `data_type_query_depth` and `property_type_query_depth` needs
/// to be specified. For a give [`PropertyType`], which is referring to another [`PropertyType`],
/// which itself refers to a [`DataType`], referenced [`PropertyType`] will be returned as well if
/// `property_type_query_depth` is at least `1`. If in addition `data_type_query_depth` is at least
/// `1`, the [`DataType`] will be returned as well.
///
/// If `property_type_query_depth` is set to `0`, this will not return any referenced record,
/// regardless of the `data_type_query_depth`.
///
/// [`DataType`]: type_system::DataType
/// [`PropertyType`]: type_system::PropertyType
pub type QueryDepth = u8;

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
