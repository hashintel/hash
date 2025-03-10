//! # HASH Graph API
//!
//! This crate provides the REST and HaRPC APIs for the HASH Graph.
//!
//! ## OpenAPI Documentation
//!
//! The API includes automatic OpenAPI specification generation. To generate the latest OpenAPI
//! specification:
//!
//! ```bash
//! yarn codegen:generate-openapi-specs
//! ```
//!
//! This will generate the OpenAPI specification in the `openapi/` directory, which can be used
//! to generate client SDKs or to document the API.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    impl_trait_in_assoc_type,
    never_type,
    return_type_notation,
    error_generic_member_access
)]

extern crate alloc;

pub mod rest;
pub mod rpc;
