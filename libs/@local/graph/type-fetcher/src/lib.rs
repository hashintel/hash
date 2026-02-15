//! # HASH Graph Type Fetcher
//!
//! ## Workspace dependencies
#![feature(
    // Library Features
    ip,
)]
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

extern crate alloc;

pub mod fetcher;
pub mod fetcher_server;

pub use self::store::{FetchingPool, FetchingStore, FetchingStoreError, TypeFetcher};

mod store;
