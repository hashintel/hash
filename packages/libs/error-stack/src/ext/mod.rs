//! Extension traits for foreign types.

#[cfg(feature = "futures")]
pub mod future;
// false positive, is imported in `lib.rs`
#[allow(unreachable_pub)]
pub mod iter;
pub mod result;
#[cfg(feature = "futures")]
pub mod stream;
