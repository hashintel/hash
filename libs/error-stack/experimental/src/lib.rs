#![doc = include_str!("../README.md")]
#![cfg_attr(all(doc, nightly), feature(doc_auto_cfg))]

pub use self::{iter::IteratorExt, result::ResultMultiExt, tuple::TupleExt};

mod iter;
mod result;
mod tuple;
