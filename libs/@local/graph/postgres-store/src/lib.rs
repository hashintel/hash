//! The entity-graph query-layer for the HASH datastore.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    doc_cfg,
    impl_trait_in_assoc_type,
    never_type,
    trait_alias,
    type_alias_impl_trait,

    // Library Features
    extend_one,
    iter_intersperse,
    try_find,
)]
#![cfg_attr(not(miri), doc(test(attr(deny(warnings, clippy::all)))))]
#![expect(
    unreachable_pub,
    clippy::significant_drop_tightening,
    reason = "This should be enabled but it's currently too noisy"
)]

extern crate alloc;

use core::fmt;
use std::path::{Path, PathBuf};

pub mod ontology;
pub mod permissions;
pub mod snapshot;
pub mod store;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Environment {
    Development,
    Test,
    Production,
}

impl fmt::Display for Environment {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::Development => "development",
            Self::Test => "test",
            Self::Production => "production",
        })
    }
}

/// Loads the environment variables from the repository root .env files.
pub fn load_env(environment: impl Into<Option<Environment>>) -> Vec<PathBuf> {
    let environment = environment.into().unwrap_or(if cfg!(test) {
        Environment::Test
    } else if cfg!(debug_assertions) {
        Environment::Development
    } else {
        Environment::Production
    });

    let environment_path = format!(".env.{environment}");
    let environment_path_local = format!(".env.{environment}.local");

    [
        ".env.local",
        &environment_path_local,
        &environment_path,
        ".env",
    ]
    .into_iter()
    .filter_map(|path| {
        dotenv_flow::from_filename(
            Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../..")).join(path),
        )
        .ok()
    })
    .collect()
}
