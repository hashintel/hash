//! Secret values that are zeroed on drop, and the cryptography that uses them.
//!
//! A function that writes into a secret zeroes it when it fails.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(clone_to_uninit, clone_from_ref, impl_restriction, ptr_metadata)]
#![cfg_attr(feature = "clap", feature(impl_trait_in_assoc_type))]

extern crate alloc;

pub mod aes_gcm;
mod buffer;
#[cfg(feature = "clap")]
mod cli;
pub mod digest;
mod hex;
pub mod hkdf;
pub mod hmac;
pub mod random;
mod secret;

pub use self::{buffer::SecretBuffer, hex::HexError, secret::Secret};
