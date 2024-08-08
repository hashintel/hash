use text_size::TextRange;

use super::Expr;
use crate::{r#type::Type, value::Value, Spanned};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstantType<'arena> {
    pub r#type: Type<'arena>,
    pub span: TextRange,
}

impl Spanned for ConstantType<'_> {
    fn span(&self) -> TextRange {
        self.span
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Constant<'arena, 'source> {
    pub value: Value<'arena, 'source>,
    pub r#type: Option<ConstantType<'arena>>,
}

impl<'arena, 'source> From<Constant<'arena, 'source>> for Expr<'arena, 'source> {
    fn from(constant: Constant<'arena, 'source>) -> Self {
        Self::Constant(constant)
    }
}
