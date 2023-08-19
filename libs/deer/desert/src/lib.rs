#![no_std]

extern crate alloc;

pub(crate) mod array;
mod assert;
mod deserializer;
pub mod error;
pub(crate) mod object;
mod skip;
pub(crate) mod tape;
mod token;

pub use assert::{
    assert_tokens, assert_tokens_any_error, assert_tokens_deserialize, assert_tokens_error,
    assert_tokens_with_assertion, assert_tokens_with_context, assert_tokens_with_context_error,
};
pub use token::Token;
