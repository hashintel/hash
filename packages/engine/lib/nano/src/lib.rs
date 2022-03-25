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
    clippy::pedantic,
    clippy::nursery,
    clippy::restriction,
    reason = "All warnings are enabled by default"
)]
// TODO: DOC
#![allow(
    clippy::missing_docs_in_private_items,
    reason = "Documentation in the engine should be improved in general"
)]
// TODO: OPTIM
#![allow(
    clippy::missing_inline_in_public_items,
    reason = "We didn't any serious optimization work until now"
)]
#![allow(
    clippy::implicit_return,
    clippy::expect_used,
    clippy::unreachable,
    clippy::integer_arithmetic,
    clippy::blanket_clippy_restriction_lints,
    clippy::pattern_type_mismatch,
    reason = "Allow lints, which are too verbose to verbose to apply"
)]
#![allow(
    clippy::redundant_pub_crate,
    reason = "Conflicts with `unreachable_pub`, see rust-lang/rust-clippy#5369"
)]

mod client;
mod error;
mod server;
mod spmc;

const SEND_ERROR_MESSAGE: &str = "Could not send message to nng";
const RECV_ERROR_MESSAGE: &str = "Could not receive message from nng";

pub use self::{
    client::Client,
    error::{Error, Result},
    server::Server,
};
