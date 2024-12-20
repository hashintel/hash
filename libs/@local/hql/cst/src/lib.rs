#![feature(allocator_api, box_into_boxed_slice)]
#![cfg_attr(test, feature(assert_matches))]

extern crate alloc;

pub mod arena;
pub mod expr;
pub mod symbol;
pub mod r#type;
pub mod value;

use hql_span::SpanId;

pub trait Spanned {
    fn span(&self) -> SpanId;
}
