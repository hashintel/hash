//! Guards without lifetimes, which implements [`Send`] and [`Sync`].
//!
//! Usually locking a [`RwLock`] would give a guard that has a lifetime depending on the [`RwLock`],
//! but for a `Proxy`, this isn’t necessary, because as long as the `Proxy` exists, the underlying
//! data will be locked, so it's not possible to create another `Proxy` if the existing `Proxy` or
//! the new `Proxy` is writable.
//!
//! As the `Proxy` is just a pointer into the [`RwLock`], proxies are very small. This also implies,
//! that the data behind a `Proxy` is automatically [`Pin`]ned.
//!
//! [`RwLock`]: std::sync::RwLock
//! [`Pin`]: core::pin::Pin

mod batch;
mod batch_pool;
mod pool;

pub use self::{
    batch::{BatchReadProxy, BatchWriteProxy},
    batch_pool::BatchPool,
    pool::{PoolReadProxy, PoolWriteProxy},
};
