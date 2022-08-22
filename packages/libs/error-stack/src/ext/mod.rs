#[cfg(feature = "futures")]
pub mod future;
// false positive, is imported in `lib.rs`
#[allow(unreachable_pub)]
pub mod iter;
mod result;
#[cfg(feature = "futures")]
pub mod stream;

#[cfg(feature = "futures")]
pub use self::{future::FutureExt, stream::StreamExt};
pub use self::{
    iter::IteratorExt,
    result::{IntoReport, Result, ResultExt},
};
