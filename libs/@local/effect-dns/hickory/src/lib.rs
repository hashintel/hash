//! # Effect-DNS Hickory
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![allow(clippy::cfg_not_test, reason = "napi macro uses cfg(not(test))")]

use napi_derive::napi;

#[napi]
#[must_use]
pub const fn sum(lhs: i32, rhs: i32) -> i32 {
    lhs + rhs
}
