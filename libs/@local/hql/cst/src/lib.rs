#![feature(allocator_api, box_into_boxed_slice)]

extern crate alloc;

use justjson::parser::ParseDelegate;

use self::{call::Call, constant::Constant, signature::Signature, symbol::Symbol};

pub mod arena;
pub mod call;
pub mod constant;
pub mod expr;
pub(crate) mod parse;
pub mod signature;
pub mod symbol;
pub mod r#type;
