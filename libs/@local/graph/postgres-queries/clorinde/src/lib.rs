// This file was generated with `clorinde`. Do not modify.

mod array_iterator;
pub mod client;
mod domain;
#[allow(clippy::all, clippy::pedantic)]
#[allow(unused_variables)]
#[allow(unused_imports)]
#[allow(dead_code)]
pub mod queries;
mod type_traits;
#[allow(clippy::all, clippy::pedantic)]
#[allow(unused_variables)]
#[allow(unused_imports)]
#[allow(dead_code)]
pub mod types;
mod utils;
pub use array_iterator::ArrayIterator;
#[cfg(feature = "deadpool")]
pub use deadpool_postgres;
pub use domain::{Domain, DomainArray};
#[cfg(not(any(feature = "deadpool", feature = "wasm-async")))]
pub use postgres;
#[cfg(any(feature = "deadpool", feature = "wasm-async"))]
pub use tokio_postgres;
pub use type_traits::{ArraySql, BytesSql, IterSql, StringSql};
pub(crate) use utils::slice_iter;
