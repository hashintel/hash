//! Extension traits for foreign types.

#[cfg(feature = "futures")]
pub mod future;
pub mod iter;
pub mod result;
#[cfg(feature = "futures")]
pub mod stream;
