#![feature(allocator_api, box_into_boxed_slice)]
#![cfg_attr(test, feature(assert_matches))]

extern crate alloc;

pub mod arena;
pub mod call;
pub(crate) mod codec;
pub mod constant;
pub mod expr;
pub(crate) mod parse;
pub mod path;
pub mod signature;
pub mod symbol;
pub mod r#type;
pub mod value;

use text_size::TextRange;

pub use self::{
    arena::Arena, call::Call, constant::Constant, expr::Expr, path::Path, signature::Signature,
    symbol::Symbol, r#type::Type,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Node<'a> {
    pub expr: Expr<'a>,
    pub span: TextRange,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Spanned<T> {
    pub node: T,
    pub span: TextRange,
}

pub struct Program<'a> {
    pub exprs: arena::Vec<'a, Node<'a>>,
}
