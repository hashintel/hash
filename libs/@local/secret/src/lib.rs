//! Secret values that are zeroed on drop.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(clone_to_uninit, clone_from_ref, impl_restriction, ptr_metadata)]
#![cfg_attr(feature = "clap", feature(impl_trait_in_assoc_type))]

extern crate alloc;

mod buffer;
#[cfg(feature = "clap")]
mod cli;
mod hex;
mod secret;

pub use self::{buffer::SecretBuffer, hex::HexError, secret::Secret};
