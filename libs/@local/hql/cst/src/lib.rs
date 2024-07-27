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

use text_size::{TextRange, TextSize};

pub use self::{
    arena::Arena, call::Call, constant::Constant, expr::Expr, path::Path, signature::Signature,
    symbol::Symbol, r#type::Type,
};

pub struct Node<'a> {
    pub expr: Expr<'a>,
    pub range: TextRange,
}
