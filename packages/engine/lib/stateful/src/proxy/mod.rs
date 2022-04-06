//! Provides structs that behave as guards for the read/write locks on batches and pools that
//! you can send between threads.
//!
//! Proxies are basically just self-referential structs, which is why they use pointers/unsafe code
//! internally. Usually locking a [`RwLock`] would give a Guard that has a lifetime depending on the
//! [`RwLock`], but in our use case, this isn’t necessary, because as long as the Proxy exists, an
//! [`Arc`] containing the [`RwLock`] will exist, so there’s no possibility of the Proxy referencing
//! a [`RwLock`] that no longer exists. In other words, the Proxy is like a self-referential struct
//! containing both a guard and an [`Arc`] with the [`RwLock`] that the guard refers to, so as long
//! as the `Proxy` exists, the [`RwLock`] will also exist and the guard will refer to an existing
//! [`RwLock`].
//!
//! Also, the guard is actually just the pointer inside the [`RwLock`], so we don’t need to store it
//! in a separate field. Also, the [`RwLock`] is like a [`Box`] in the sense that even if it is
//! moved, its contents stay in the same place on the heap, so they don’t need to be pinned --
//! therefore, if the `Proxy` is moved, the references returned by the Proxy to its [`RwLock`]s
//! contents (i.e. its “guard”) will still be valid.

mod batch;

pub use self::batch::{BatchReadProxy, BatchWriteProxy};
