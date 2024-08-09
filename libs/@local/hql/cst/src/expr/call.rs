use super::Expr;
use crate::{arena, expr::ExprKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Call<'arena, 'source> {
    pub r#fn: arena::Box<'arena, Expr<'arena, 'source>>,
    pub args: arena::Box<'arena, [Expr<'arena, 'source>]>,
}

impl<'arena, 'source> From<Call<'arena, 'source>> for ExprKind<'arena, 'source> {
    fn from(call: Call<'arena, 'source>) -> Self {
        Self::Call(call)
    }
}
