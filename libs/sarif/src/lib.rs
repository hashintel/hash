#![doc = include_str!("../README.md")]
#![no_std]
#![feature(lint_reasons, coverage_attribute)]
#![cfg_attr(
    doc,
    feature(doc_auto_cfg),
    doc(test(attr(deny(warnings, clippy::pedantic, clippy::nursery))))
)]
#![warn(
    missing_docs,
    clippy::expect_used,
    clippy::panic,
    clippy::unreachable,
    clippy::unimplemented
)]
#![forbid(unsafe_code)]

extern crate alloc;
#[cfg(test)]
extern crate std;

pub mod schema;

#[cfg(feature = "serde")]
pub(crate) mod serde;
