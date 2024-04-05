//! # Wire Protocol
//!
//! Binary protocol for communication between client and server, that is agnostic to any data
//! encoding with support for streaming.
//!
//! Due to cross language concerns, the protocol is designed to be as simple as possible, with
//! minimal overhead. Instead of relying on an existing library, due to the aforementioned reasons,
//! a manual encoder and decoder is implemented. This ensures that the correct data is sent over the
//! wire and that the protocol is well defined.
//!
//! An illustration of the protocol can be seen in the `docs/` folder of the project.
#![cfg_attr(test, feature(async_fn_track_caller))]
#![feature(lint_reasons, associated_type_defaults)]

pub mod codec;
pub mod encoding;
pub mod protocol;
pub mod request;
