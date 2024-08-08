use crate::{arena, expr::Expr};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Call<'a> {
    pub r#fn: arena::Box<'a, Expr<'a>>,
    pub args: arena::Box<'a, [Expr<'a>]>,
}
