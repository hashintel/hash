#![feature(assert_matches)]

extern crate alloc;

pub mod error;
pub(crate) mod lexer;
pub(crate) mod parser;
pub mod span;
