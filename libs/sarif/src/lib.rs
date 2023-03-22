#![doc = include_str!("../README.md")]
#![no_std]
#![feature(lint_reasons)]
#![cfg_attr(
    doc,
    feature(doc_auto_cfg),
    doc(test(attr(deny(warnings, clippy::pedantic, clippy::nursery))))
)]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

extern crate alloc;
#[cfg(test)]
extern crate std;

pub mod schema;
