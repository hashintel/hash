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

use self::expr::Expr;

pub trait Spanned {
    fn span(&self) -> SpanId;
}

pub struct Program<'arena, 'source> {
    pub expressions: arena::Vec<'arena, Expr<'arena, 'source>>,
    pub span: SpanId,
}

impl<'arena, 'source> Spanned for Program<'arena, 'source> {
    fn span(&self) -> SpanId {
        self.span
    }
}
