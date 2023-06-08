use async_trait::async_trait;
use error_stack::Result;

use crate::{identifier::account::AccountId, store::InsertionError};

/// Describes the API of a store implementation for accounts.
#[async_trait]
pub trait AccountStore {
    /// Inserts the specified [`AccountId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountId`] already exists.
    async fn insert_account_id(&mut self, account_id: AccountId) -> Result<(), InsertionError>;
}
