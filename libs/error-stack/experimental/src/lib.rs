#![doc = include_str!("../README.md")]
#![cfg_attr(all(doc, nightly), feature(doc_auto_cfg))]

#[cfg(feature = "stream")]
pub use self::stream::TryReportStreamExt;
pub use self::{iter::TryReportIteratorExt, result::ResultMultiExt, tuple::TryReportTupleExt};

mod iter;
mod result;
#[cfg(feature = "stream")]
mod stream;
mod tuple;
