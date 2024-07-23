#![feature(allocator_api, box_into_boxed_slice)]

extern crate alloc;

pub mod arena;
pub mod call;
pub mod codec;
pub mod constant;
pub mod expr;
pub(crate) mod parse;
pub mod signature;
pub mod symbol;
pub mod r#type;
