#![no_std]
#![cfg_attr(
    doc,
    feature(doc_auto_cfg),
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

pub mod schema;

#[cfg(feature = "serde")]
pub(crate) mod serde;
