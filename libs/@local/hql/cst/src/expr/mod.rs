pub mod call;
pub mod constant;
pub mod path;
pub mod signature;

use hql_span::SpanId;

use self::{call::Call, constant::Constant, path::Path, signature::Signature};
use crate::Spanned;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExprKind<'arena, 'source> {
    Call(Call<'arena, 'source>),
    Signature(Signature<'arena>),
    Path(Path<'arena>),
    Constant(Constant<'arena, 'source>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Expr<'arena, 'source> {
    pub kind: ExprKind<'arena, 'source>,
    pub span: SpanId,
}

impl Spanned for Expr<'_, '_> {
    fn span(&self) -> SpanId {
        self.span
    }
}
