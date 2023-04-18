use deer::{
    error::{DeserializerError, Variant},
    Context, EnumVisitor, OptionalVisitor, Visitor,
};
use error_stack::{Report, Result, ResultExt};
use justjson::{
    parser::{Token, Tokenizer},
    AnyStr,
};

use crate::{
    error::{convert_tokenizer_error, Position, SyntaxError},
    number::try_convert_number,
};

macro_rules! next {
    ($self:ident) => {{
        let offset = $self.tokenizer.offset();
        let Some(token) = $self.tokenizer.next() else {
                                    return Err(Report::new(SyntaxError::UnexpectedEof.into_error())
                                        .attach(Position::new(offset))
                                        .change_context(DeserializerError))
                                };

        token
            .map_err(convert_tokenizer_error)
            .change_context(DeserializerError)?
    }};
}

pub struct Stack {
    limit: usize,
    depth: usize,
}

pub struct Deserializer<'a, 'b> {
    tokenizer: Tokenizer<'a, false>,
    context: &'b Context,
    stack: Stack,
}

impl<'de> deer::Deserializer<'de> for Deserializer<'de, '_> {
    fn context(&self) -> &Context {
        self.context
    }

    fn deserialize_any<V>(mut self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = next!(self);

        match token {
            Token::Null => visitor.visit_null(),
            Token::Bool(value) => visitor.visit_bool(value),
            Token::String(value) => match value.decode_if_needed() {
                AnyStr::Owned(value) => visitor.visit_string(value),
                AnyStr::Borrowed(value) => visitor.visit_borrowed_str(value),
            },
            Token::Number(value) => {
                let value = try_convert_number(value).change_context(DeserializerError)?;

                visitor.visit_number(value)
            }
            Token::Object => {}
            // TODO: UnexpectedToken error
            Token::ObjectEnd => {}
            Token::Array => {}
            Token::ArrayEnd => {}
            Token::Colon => {}
            Token::Comma => {}
        }
        .change_context(DeserializerError)
    }

    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_array<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        todo!()
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        todo!()
    }
}
