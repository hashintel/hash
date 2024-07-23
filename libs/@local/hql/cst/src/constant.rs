use justjson::Value;

use crate::r#type::Type;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Constant<'a> {
    pub value: Value<'a>,
    pub r#type: Option<Type<'a>>,
}
