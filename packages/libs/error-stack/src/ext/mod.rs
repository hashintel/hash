#[cfg(feature = "futures")]
pub mod future;
mod result;

#[cfg(feature = "futures")]
pub use self::future::FutureExt;
pub use self::result::{IntoReport, Result, ResultExt};
