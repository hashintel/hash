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
    missing_abi,
    missing_copy_implementations,
    missing_debug_implementations,
    reason = "All applicable rustc warnings are enabled by default"
)]
// TODO: Apply lints
//   see https://app.asana.com/0/0/1202034637316243/f
#![warn(clippy::nursery)]
//     clippy::pedantic,
//     clippy::nursery,
//     clippy::restriction,
//     reason = "All clippy warnings are enabled by default"
// )]
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
    clippy::large_enum_variant,
    reason = "Box the affected variants or make the payload smaller"
)]
// #![allow(
//     clippy::redundant_pub_crate,
//     reason = "Conflicts with `unreachable_pub` \
//               see <https://github.com/rust-lang/rust-clippy/issues/5369>"
// )]

mod error;
mod globals;
pub mod message;
pub mod state;
pub mod vec;
pub mod worker;

pub use self::{
    error::{Error, Result},
    globals::Globals,
    message::Outbound,
    state::{Agent, Context, SimulationState},
    vec::Vec3,
};
