use crate::{arena, expr::Expr, Node};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Call<'arena> {
    pub r#fn: arena::Box<'arena, Node<'arena>>,
    pub args: arena::Box<'arena, [Node<'arena>]>,
}

impl<'arena, 'source> From<Call<'arena>> for Expr<'arena, 'source> {
    fn from(call: Call<'arena>) -> Self {
        Self::Call(call)
    }
}
