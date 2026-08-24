#![cfg_attr(doc, doc = include_str!("../README.md"))]
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

pub mod actor;
pub mod delegation;
pub mod kratos;
pub mod provider;
pub mod request;
