#![feature(allocator_api, box_into_boxed_slice)]
#![cfg_attr(test, feature(assert_matches))]

extern crate alloc;

pub mod arena;
pub(crate) mod codec;
pub mod expr;
pub(crate) mod parse;
pub mod symbol;
pub mod r#type;
pub mod value;

use text_size::TextRange;

pub use self::{
    arena::Arena, call::Call, constant::Constant, expr::Expr, path::Path, signature::Signature,
    symbol::Symbol, r#type::Type,
};

pub trait Span {
    fn span(&self) -> TextRange;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Node<'arena> {
    pub expr: Expr<'arena>,
    pub span: TextRange,
}

impl Span for Node<'_> {
    fn span(&self) -> TextRange {
        self.span
    }
}

pub struct Program<'a> {
    pub exprs: arena::Vec<'a, Node<'a>>,
}
