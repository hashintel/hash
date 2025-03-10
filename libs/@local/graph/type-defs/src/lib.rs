//! # HASH Graph Type Defs
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

pub mod error;
pub mod status_payloads {
    #![expect(dead_code)]
    #![expect(warnings)]
    #![expect(clippy::all)]
    #![expect(rustdoc::all)]
    include!(concat!(env!("OUT_DIR"), "/status_payloads.rs"));
}
