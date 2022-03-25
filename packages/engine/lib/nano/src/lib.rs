#![feature(lint_reasons)]
#![cfg_attr(not(miri), doc(test(attr(deny(warnings)))))]
#![deny(
    unsafe_code,
    reason = "Unsafe code should not be needed for this module"
)]
#![warn(
    future_incompatible,
    rust_2018_compatibility,
    rust_2018_idioms,
    rust_2021_compatibility,
    macro_use_extern_crate,
    meta_variable_misuse,
    non_ascii_idents,
    noop_method_call,
    trivial_casts,
    trivial_numeric_casts,
    unreachable_pub,
    unused_crate_dependencies,
    unused_import_braces,
    unused_lifetimes,
    unused_qualifications,
    unused_results,
    missing_abi,
    missing_copy_implementations,
    missing_debug_implementations,
    reason = "All warnings are enabled by default"
)]

mod client;
mod error;
mod server;
mod spmc;

pub use self::{
    client::Client,
    error::{Error, Result},
    server::Server,
};
