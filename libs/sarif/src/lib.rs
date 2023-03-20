#![doc = include_str!("../README.md")]
#![no_std]
#![feature(lint_reasons)]
#![feature(doc_auto_cfg)]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

extern crate alloc;
#[cfg(test)]
extern crate std;

pub mod schema;
