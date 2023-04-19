use deer::{
    error::{DeserializerError, ExpectedType, ReceivedType, TypeError, Variant},
    schema::Document,
    Context, Deserialize, EnumVisitor, Number, OptionalVisitor, Reflection, Visitor,
};
use error_stack::{Report, Result, ResultExt};
use justjson::{
    parser::{PeekableTokenKind, Token, Tokenizer},
    AnyStr,
};

use crate::{
    array,
    error::{convert_tokenizer_error, BytesUnsupportedError, Position, SyntaxError},
    number::try_convert_number,
    object,
    token::ValueToken,
};

pub struct Stack {
    limit: usize,
    depth: usize,
}

pub struct Deserializer<'a, 'b> {
    tokenizer: Tokenizer<'a, false>,
    context: &'b Context,
    stack: Stack,
}

impl<'a, 'b> Deserializer<'a, 'b> {
    fn next(&mut self) -> Result<Token<'a>, DeserializerError> {
        let offset = self.tokenizer.offset();
        let Some(token) = self.tokenizer.next() else {
            return Err(Report::new(SyntaxError::UnexpectedEof.into_error())
                .attach(Position::new(offset))
                .change_context(DeserializerError))
        };

        token
            .map_err(convert_tokenizer_error)
            .change_context(DeserializerError)
    }

    fn next_value(&mut self) -> Result<ValueToken<'a>, DeserializerError> {
        let token = self.next()?;

        ValueToken::try_from(token).change_context(DeserializerError)
    }

    fn recover(&mut self, token: &ValueToken<'a>) {
        match token {
            ValueToken::Object => object::recover(&mut self.tokenizer),
            ValueToken::Array => array::recover(&mut self.tokenizer),
            _ => {}
        }
    }

    fn error_invalid_type(
        &mut self,
        received: &ValueToken<'a>,
        expected: Document,
    ) -> Report<DeserializerError> {
        self.recover(received);

        Report::new(TypeError.into_error())
            .attach(ExpectedType::new(expected))
            .attach(ReceivedType::new(received.schema()))
            .change_context(DeserializerError)
    }
}

// TODO: stack check

impl<'de> deer::Deserializer<'de> for Deserializer<'de, '_> {
    fn context(&self) -> &Context {
        self.context
    }

    fn deserialize_any<V>(mut self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = self.next_value()?;

        match token {
            ValueToken::Null => visitor.visit_null(),
            ValueToken::Bool(value) => visitor.visit_bool(value),
            ValueToken::String(value) => match value.decode_if_needed() {
                AnyStr::Owned(value) => visitor.visit_string(value),
                AnyStr::Borrowed(value) => visitor.visit_borrowed_str(value),
            },
            ValueToken::Number(value) => {
                let value = try_convert_number(value).change_context(DeserializerError)?;

                visitor.visit_number(value)
            }
            ValueToken::Object => {
                todo!()
            }
            ValueToken::Array => {
                todo!()
            }
        }
        .change_context(DeserializerError)
    }

    fn deserialize_null<V>(mut self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = self.next_value()?;

        match token {
            ValueToken::Null => visitor.visit_null().change_context(DeserializerError),
            token => Err(self.error_invalid_type(&token, <()>::reflection())),
        }
    }

    fn deserialize_bool<V>(mut self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = self.next_value()?;

        match token {
            ValueToken::Bool(value) => visitor.visit_bool(value).change_context(DeserializerError),
            token => Err(self.error_invalid_type(&token, bool::reflection())),
        }
    }

    fn deserialize_number<V>(mut self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = self.next_value()?;

        match token {
            ValueToken::Number(value) => visitor
                .visit_number(try_convert_number(value).change_context(DeserializerError)?)
                .change_context(DeserializerError),
            token => Err(self.error_invalid_type(&token, Number::reflection())),
        }
    }

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        self.deserialize_str(visitor)
    }

    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        self.deserialize_str(visitor)
    }

    fn deserialize_str<V>(mut self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = self.next_value()?;

        match token {
            ValueToken::String(value) => match value.decode_if_needed() {
                AnyStr::Owned(value) => visitor.visit_string(value),
                AnyStr::Borrowed(value) => visitor.visit_borrowed_str(value),
            }
            .change_context(DeserializerError),
            token => Err(self.error_invalid_type(&token, str::document())),
        }
    }

    fn deserialize_bytes<V>(self, _: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        Err(Report::new(BytesUnsupportedError.into_error()).change_context(DeserializerError))
    }

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        self.deserialize_bytes(visitor)
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

    fn deserialize_optional<V>(mut self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        let offset = self.tokenizer.offset();
        match self.tokenizer.peek() {
            None => Err(Report::new(SyntaxError::UnexpectedEof.into_error())
                .attach(Position::new(offset))
                .change_context(DeserializerError)),
            Some(PeekableTokenKind::Null) => {
                // we know the value will be `null`, therefore we can just discard the next token
                let _ = self.tokenizer.next();

                visitor.visit_null().change_context(DeserializerError)
            }
            _ => visitor.visit_some(self).change_context(DeserializerError),
        }
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        todo!()
    }
}
