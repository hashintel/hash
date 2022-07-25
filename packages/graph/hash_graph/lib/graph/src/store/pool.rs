use async_trait::async_trait;
use error_stack::Result;

use crate::store::Store;

#[async_trait]
pub trait StorePool: Send + Sync {
    type Error;
    type Store<'pool>: Store + Send + Sync
    where
        Self: 'pool;

    async fn acquire(&self) -> Result<Self::Store<'_>, Self::Error>;

    async fn acquire_owned(&self) -> Result<Self::Store<'static>, Self::Error>;
}
