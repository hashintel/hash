#[cfg(feature = "futures")]
pub mod future;
pub mod iterator;
mod result;

#[cfg(feature = "futures")]
pub use self::future::FutureExt;
pub use self::{
    iter::IteratorExt,
    result::{IntoReport, Result, ResultExt},
};
