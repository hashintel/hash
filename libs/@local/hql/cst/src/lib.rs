#![feature(allocator_api, box_into_boxed_slice)]
#![cfg_attr(test, feature(assert_matches))]

extern crate alloc;

pub mod arena;
pub mod expr;
// pub mod parse;
pub mod symbol;
pub mod r#type;
pub mod value;

use hql_span::SpanId;
use text_size::TextRange;

use self::expr::Expr;

pub trait Spanned {
    fn span(&self) -> SpanId;
}

pub struct Program<'arena, 'source> {
    pub expr: arena::Vec<'arena, Expr<'arena, 'source>>,
    pub span: TextRange,
}
