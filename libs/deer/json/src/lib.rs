#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(nightly, feature(provide_any, error_in_core))]
// TODO: once more stable introduce: warning missing_docs, clippy::missing_errors_doc
#![deny(unsafe_code)]
mod array;
mod deserializer;
mod error;
mod number;
mod object;
mod token;

extern crate alloc;
