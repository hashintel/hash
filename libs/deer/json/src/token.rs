use deer::{
    Deserialize, Document, Number, Reflection, Schema,
    error::{Error, Variant as _},
};
use error_stack::Report;
use justjson::{JsonNumber, JsonString, parser::Token};

use crate::error::SyntaxError;

// This is like `justjson::Token` but does not contain syntax tokens like `ArrayEnd` or `ObjectEnd`
pub(crate) enum ValueToken<'a> {
    Null,
    Bool(bool),
    String(JsonString<'a>),
    Number(JsonNumber<'a>),
    Object,
    Array,
}

impl<'a> TryFrom<Token<'a>> for ValueToken<'a> {
    type Error = Report<Error>;

    fn try_from(value: Token<'a>) -> Result<Self, Self::Error> {
        match value {
            Token::Null => Ok(Self::Null),
            Token::Bool(value) => Ok(Self::Bool(value)),
            Token::String(value) => Ok(Self::String(value)),
            Token::Number(value) => Ok(Self::Number(value)),
            Token::Object => Ok(Self::Object),
            Token::Array => Ok(Self::Array),
            Token::ObjectEnd => Err(Report::new(SyntaxError::UnexpectedByte(b'}').into_error())),
            Token::ArrayEnd => Err(Report::new(SyntaxError::UnexpectedByte(b']').into_error())),
            Token::Colon => Err(Report::new(SyntaxError::UnexpectedByte(b':').into_error())),
            Token::Comma => Err(Report::new(SyntaxError::UnexpectedByte(b',').into_error())),
        }
    }
}

struct AnyObject;

impl Reflection for AnyObject {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("object")
    }
}

struct AnyArray;

impl Reflection for AnyArray {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("array")
    }
}

impl ValueToken<'_> {
    pub(crate) fn schema(&self) -> Document {
        match self {
            Self::Null => <() as Deserialize>::reflection(),
            Self::Bool(_) => bool::reflection(),
            Self::String(_) => str::document(),
            Self::Number(_) => Number::reflection(),
            Self::Object => AnyObject::document(),
            Self::Array => AnyArray::document(),
        }
    }
}
