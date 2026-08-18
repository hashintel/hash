#![cfg_attr(doc, doc = include_str!("../README.md"))]
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![cfg_attr(test, feature(variant_count))]

extern crate alloc;

pub mod actor;
pub mod cloudflare;
pub mod delegation;
pub mod jwt;
pub mod kratos;
pub mod provider;
pub mod request;
