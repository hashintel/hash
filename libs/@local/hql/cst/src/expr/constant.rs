use super::ExprKind;
use crate::{r#type::Type, value::Value};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Constant<'arena, 'source> {
    pub value: Value<'arena, 'source>,
    pub r#type: Option<Type<'arena>>,
}

impl<'arena, 'source> From<Constant<'arena, 'source>> for ExprKind<'arena, 'source> {
    fn from(constant: Constant<'arena, 'source>) -> Self {
        Self::Constant(constant)
    }
}
