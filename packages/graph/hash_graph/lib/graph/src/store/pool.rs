use async_trait::async_trait;
use error_stack::Result;

use crate::store::Store;

#[async_trait]
pub trait StorePool: Send + Sync {
    type Error;
    type Store: Store + Send;

    async fn acquire(&self) -> Result<Self::Store, Self::Error>;
}
