//! The entity-graph query-layer for the HASH datastore

// Not required, reason: code quality
#![feature(lint_reasons)]
// Not required, reason: Simpler than using blanket implementations
#![feature(trait_alias)]
// Not required, reason: much more simple bounds
#![feature(associated_type_bounds, impl_trait_in_assoc_type)]
#![feature(try_find)]
#![feature(type_alias_impl_trait)]
#![feature(hash_raw_entry)]
#![feature(bound_map)]
#![cfg_attr(all(doc, nightly), feature(doc_auto_cfg))]
#![cfg_attr(not(miri), doc(test(attr(deny(warnings, clippy::all)))))]
#![expect(
    unreachable_pub,
    reason = "This should be enabled but it's currently too noisy"
)]

use std::{
    fmt,
    path::{Path, PathBuf},
};

pub mod api;

pub mod knowledge;
pub mod ontology;
pub mod subgraph;

pub mod store;

pub mod snapshot;

pub mod logging;

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
