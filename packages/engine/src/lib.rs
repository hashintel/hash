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
#![allow(
    clippy::borrowed_box,
    clippy::wrong_self_convention,
    clippy::diverging_sub_expression,
    clippy::expect_fun_call,
    clippy::large_enum_variant,
    clippy::type_complexity,
    clippy::module_inception,
    clippy::new_ret_no_self,
    clippy::unnecessary_cast,
    clippy::enum_variant_names,
    clippy::should_implement_trait,
    clippy::mutex_atomic
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

// Suppress weird warning about unused dev-dependencies
// TODO: Remove when overhauling error handling
#[cfg(test)]
mod suppress_weird_warning_about_unused_dev_dependencies {
    use ::error as _;
    use ::provider as _;
}

pub use self::{
    args::{args, Args},
    config::{experiment_config, ExperimentConfig, SimRunConfig, SimulationConfig},
    env::{env, Environment},
    error::{Error, Result},
    experiment::init_exp_package,
    language::Language,
    utils::init_logger,
};
