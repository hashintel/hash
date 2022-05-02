#![feature(backtrace, box_patterns, map_try_insert, once_cell, test, is_sorted)]
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
    unused_extern_crates,
    unused_import_braces,
    unused_lifetimes,
    unused_qualifications,
    clippy::wildcard_imports
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

mod args;
pub mod config;
pub mod datastore;
pub mod env;
mod error;
pub mod experiment;
pub mod fetch;
pub mod language;
pub mod output;
pub mod proto;
pub mod simulation;
pub mod types;
pub mod utils;
pub mod worker;
pub mod workerpool;

pub use self::{
    args::{args, Args},
    error::{Error, Result},
};
