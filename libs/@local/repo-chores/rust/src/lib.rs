//! # HASH Repo Chores
//!
//! This crate contains a collection of utilities for managing and analyzing repositories.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Library Features
    exit_status_error
)]

extern crate alloc;

pub mod benches;
pub mod cli;
pub(crate) mod dependency_diagram;
pub(crate) mod lcov;
pub(crate) mod sort_package_json;
pub(crate) mod sync_turborepo;
