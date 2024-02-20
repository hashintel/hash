#![feature(lint_reasons)]
#![allow(unsafe_code)]
#![cfg_attr(not(target_arch = "wasm32"), warn(unreachable_pub))]

mod ontology;
mod utils;

pub use ontology::*;
