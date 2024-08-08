#![feature(assert_matches, new_range_api)]

extern crate alloc;

pub mod error;
pub(crate) mod lexer;
pub(crate) mod parser;
pub mod span;
