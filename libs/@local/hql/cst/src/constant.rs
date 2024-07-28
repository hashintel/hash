use serde_json::Value;

use crate::{r#type::Type, Spanned};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Constant<'a> {
    pub value: Spanned<Value>,
    pub r#type: Option<Spanned<Type<'a>>>,
}
