use async_trait::async_trait;
use authorization::AuthorizationApi;
use error_stack::Result;
use graph_types::account::AccountId;

use crate::store::InsertionError;

/// Describes the API of a store implementation for accounts.
#[async_trait]
pub trait AccountStore {
    /// Inserts the specified [`AccountId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountId`] already exists.
    async fn insert_account_id<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        account_id: AccountId,
    ) -> Result<(), InsertionError>;
}
