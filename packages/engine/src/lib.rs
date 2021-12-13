#![feature(backtrace, box_patterns, map_try_insert, once_cell, test)]
#![warn(
    rust_2018_compatibility,
    rust_2018_idioms,
    rust_2021_compatibility,
    deprecated_in_future,
    elided_lifetimes_in_paths,
    explicit_outlives_requirements,
    keyword_idents,
    macro_use_extern_crate,
    meta_variable_misuse,
    missing_abi,
    non_ascii_idents,
    noop_method_call,
    pointer_structural_match,
    unused_crate_dependencies,
    unused_extern_crates,
    unused_import_braces,
    unused_lifetimes,
    unused_qualifications
)]

pub mod config;
pub mod datastore;
pub mod error;
pub mod experiment;
pub mod fetch;
pub mod hash_types;
pub mod language;
pub mod nano;
pub mod output;
pub mod proto;
pub mod simulation;
pub mod types;
pub mod worker;
pub mod workerpool;

mod args;
pub mod env;
pub mod utils;

pub use args::{args, Args};
pub use config::{experiment_config, ExperimentConfig, SimRunConfig, SimulationConfig};
pub use env::{env, Environment};
pub use error::{Error, Result};
pub use experiment::init_exp_package;
pub use language::Language;
pub use utils::init_logger;
