#![feature(allocator_api, box_into_boxed_slice)]

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

pub use self::{
    arena::Arena, call::Call, constant::Constant, expr::Expr, path::Path, signature::Signature,
    symbol::Symbol, r#type::Type,
};
