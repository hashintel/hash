use std::future::Future;

use error_stack::Result;
use graph_types::account::AccountId;

use crate::store::InsertionError;

/// Describes the API of a store implementation for accounts.
pub trait AccountStore {
    /// Inserts the specified [`AccountId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountId`] already exists.
    fn insert_account_id(
        &mut self,
        account_id: AccountId,
    ) -> impl Future<Output = Result<(), InsertionError>> + Send;
}
