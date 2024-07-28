use crate::{arena, expr::Expr, Node};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Call<'arena, 'source> {
    pub r#fn: arena::Box<'arena, Node<'arena, 'source>>,
    pub args: arena::Box<'arena, [Node<'arena, 'source>]>,
}

impl<'arena, 'source> From<Call<'arena, 'source>> for Expr<'arena, 'source> {
    fn from(call: Call<'arena, 'source>) -> Self {
        Self::Call(call)
    }
}
