use core::ops::Range;

use deer::{
    error::{DeserializerError, ExpectedType, ReceivedType, TypeError, Variant},
    schema::Document,
    Context, Deserialize, EnumVisitor, Number, OptionalVisitor, Reflection, StructVisitor, Visitor,
};
use error_stack::{Report, Result, ResultExt};
use justjson::{
    parser::{PeekableTokenKind, Token, Tokenizer},
    AnyStr,
};

use crate::{
    error::{convert_tokenizer_error, BytesUnsupportedError, Position, SyntaxError},
    number::try_convert_number,
    object::ObjectAccess,
    skip::skip_tokens,
    token::ValueToken,
};

pub struct Stack {
    limit: usize,
    depth: usize,
}

pub struct Deserializer<'a, 'de> {
    pub(crate) tokenizer: Tokenizer<'de, false>,
    context: &'a Context,
    stack: Stack,
}

impl<'a, 'de> Deserializer<'a, 'de> {
    fn next(&mut self) -> Result<Token<'de>, DeserializerError> {
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

    fn next_value(&mut self) -> Result<ValueToken<'de>, DeserializerError> {
        let token = self.next()?;

        ValueToken::try_from(token).change_context(DeserializerError)
    }

    pub(crate) fn recover(&mut self, token: &ValueToken<'de>) {
        match token {
            ValueToken::Object => skip_tokens(&mut self.tokenizer, &Token::Object),
            ValueToken::Array => skip_tokens(&mut self.tokenizer, &Token::Array),
            _ => {}
        }
    }

    pub(crate) fn skip(&mut self) -> Range<usize> {
        // `.next()` will only error out if a string or number is malformed
        // we can safely skip those as they do not affect how we skip
        let start = self.tokenizer.offset();
        let next = self.tokenizer.next();

        if let Some(Ok(token)) = next {
            skip_tokens(&mut self.tokenizer, &token);
        }

        start..self.tokenizer.offset()
    }

    pub(crate) fn peek(&mut self) -> Option<PeekableTokenKind> {
        self.tokenizer.peek()
    }

    pub(crate) const fn offset(&self) -> usize {
        self.tokenizer.offset()
    }

    fn error_invalid_type(
        &mut self,
        received: &ValueToken<'de>,
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

impl<'de> deer::Deserializer<'de> for &mut Deserializer<'_, 'de> {
    fn context(&self) -> &Context {
        self.context
    }

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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

    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = self.next_value()?;

        match token {
            ValueToken::Null => visitor.visit_null().change_context(DeserializerError),
            token => Err(self.error_invalid_type(&token, <()>::reflection())),
        }
    }

    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = self.next_value()?;

        match token {
            ValueToken::Bool(value) => visitor.visit_bool(value).change_context(DeserializerError),
            token => Err(self.error_invalid_type(&token, bool::reflection())),
        }
    }

    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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
        let token = self.next_value()?;

        match token {
            ValueToken::Object => visitor
                .visit_object(ObjectAccess::new(self))
                .change_context(DeserializerError),
            token => Err(self.error_invalid_type(&token, ValueToken::Object.schema())),
        }
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: StructVisitor<'de>,
    {
        todo!()
    }
}
