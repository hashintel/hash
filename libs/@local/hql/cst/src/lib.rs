#![feature(allocator_api, box_into_boxed_slice)]

pub mod arena;
pub(crate) mod parse;
pub mod signature;
pub mod symbol;
pub mod r#type;

extern crate alloc;

pub enum Expr<'a> {
    Call(Call<'a>),
}

pub struct Call<'a> {
    name: &'a str,
    args: Box<[Expr<'a>]>,
}
