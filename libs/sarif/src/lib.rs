#![no_std]
#![expect(
    missing_docs,
    reason = "conditionally including docs resulting in false positives. We want to globally \
              apply the lint as soon as possible."
)]
#![feature(
    // Language Features
    coverage_attribute,
)]
#![cfg_attr(
    doc,
    feature(doc_cfg),
    doc = include_str!("../README.md"),
    doc(test(attr(deny(warnings, clippy::pedantic, clippy::nursery)))),
)]
#![warn(
    clippy::expect_used,
    clippy::panic,
    clippy::unreachable,
    clippy::unimplemented
)]
#![forbid(unsafe_code)]

extern crate alloc;
#[cfg(test)]
extern crate std;

#[warn(missing_docs)]
pub mod schema;

#[cfg(feature = "serde")]
pub(crate) mod serde;
