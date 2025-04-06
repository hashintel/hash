//! # HASH Repo Chores
//!
//! This crate contains a collection of utilities for managing and analyzing repositories.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(let_chains)]

extern crate alloc;

pub mod benches;
pub mod dependency_diagram;
