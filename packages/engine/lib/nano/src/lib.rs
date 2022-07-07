//! Server-Client communication using NNG.
//!
//! Contains the [`Server`] and [`Client`] types. The [`Server`] will create a connection given an
//! `url` and the client can then connect to the server using the same `url`. It's then possible to
//! send messages from the [`Client`] to the [`Server`].

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
    reason = "All applicable rustc warnings are enabled by default"
)]
#![warn(
    clippy::pedantic,
    clippy::nursery,
    reason = "All clippy warnings are enabled by default"
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
    clippy::redundant_pub_crate,
    reason = "Conflicts with `unreachable_pub` \
              see <https://github.com/rust-lang/rust-clippy/issues/5369>"
)]

mod client;
mod error;
mod server;
mod spmc;

const SEND_EXPECT_MESSAGE: &str = "Could not send message to nng";
const RECV_EXPECT_MESSAGE: &str = "Could not receive message from nng";

pub use self::{
    client::Client,
    error::{ErrorKind, Result},
    server::Server,
};
