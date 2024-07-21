#![feature(allocator_api)]

pub mod arena;
pub(crate) mod parse;
pub mod signature;
pub mod symbol;
pub mod r#type;

extern crate alloc;

use justjson::parser::{Token, Tokenizer};
use winnow::{
    combinator::{delimited, opt, separated},
    token, Parser,
};

pub enum Expr<'a> {
    Call(Call<'a>),
}

pub struct Call<'a> {
    name: &'a str,
    args: Box<[Expr<'a>]>,
}
