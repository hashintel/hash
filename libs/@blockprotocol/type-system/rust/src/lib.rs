#![feature(lint_reasons)]
#![feature(extend_one)]
#![allow(unsafe_code)]
#![cfg_attr(
    target_arch = "wasm32",
    expect(unreachable_pub, reason = "Used in the generated TypeScript types")
)]

mod ontology;
mod utils;

pub use ontology::*;
