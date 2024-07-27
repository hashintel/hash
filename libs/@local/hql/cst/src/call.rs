use crate::{arena, expr::Expr, Node};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Call<'a> {
    pub r#fn: arena::Box<'a, Node<'a>>,
    pub args: arena::Box<'a, [Node<'a>]>,
}
