#![feature(lint_reasons)]
#![allow(unsafe_code)]
#![cfg_attr(
    target_arch = "wasm32",
    allow(unreachable_pub, reason = "Used in the generated TypeScript types")
)]

mod ontology;
mod utils;

pub use ontology::*;
