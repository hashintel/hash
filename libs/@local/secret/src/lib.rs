//! Secret values that are zeroed on drop.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(clone_to_uninit, clone_from_ref, impl_restriction, ptr_metadata)]

extern crate alloc;

mod buffer;
mod hex;
mod secret;

pub use self::{buffer::SecretBuffer, hex::HexError, secret::Secret};
