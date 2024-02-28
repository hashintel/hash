#![feature(lint_reasons)]
#![allow(unsafe_code)]
#![cfg_attr(
    target_arch = "wasm32",
    expect(unreachable_pub, reason = "Used in the generated TypeScript types"),
    expect(
        non_local_definitions,
        reason = "Tsify does not take this lint into account"
    )
)]

mod ontology;
mod utils;

pub use ontology::*;
