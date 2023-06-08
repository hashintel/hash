use core::ops::Range;

use deer::{
    error::{
        DeserializerError, Error, ExpectedLength, ExpectedType, ObjectLengthError, ReceivedType,
        TypeError, Variant,
    },
    schema::Document,
    value::NoneDeserializer,
    Context, Deserialize, EnumVisitor, IdentifierVisitor, Number, OptionalVisitor, Reflection,
    StructVisitor, Visitor,
};
use error_stack::{Report, Result, ResultExt};
use justjson::{
    parser::{PeekableTokenKind, Token, Tokenizer},
    AnyStr,
};

use crate::{
    array::ArrayAccess,
    error::{
        convert_tokenizer_error, BytesUnsupportedError, ErrorAccumulator, Position,
        RecursionLimitError, SyntaxError,
    },
    number::try_convert_number,
    object::ObjectAccess,
    skip::skip_tokens,
    token::ValueToken,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct StackLimit(usize);

impl StackLimit {
    pub fn new(limit: usize) -> Self {
        Self(limit)
    }

    pub fn limit(&self) -> usize {
        self.0
    }
}

pub(crate) struct Stack {
    limit: usize,
    depth: usize,
}

impl Stack {
    const fn new(limit: usize) -> Self {
        Self { limit, depth: 0 }
    }

    pub(crate) fn push(&mut self) -> Result<(), DeserializerError> {
        self.depth += 1;

        if self.depth >= self.limit {
            Err(Report::new(RecursionLimitError.into_error()).change_context(DeserializerError))
        } else {
            Ok(())
        }
    }

    pub(crate) fn pop(&mut self) {
        self.depth = self.depth.saturating_sub(1);
    }
}

pub struct Deserializer<'a, 'de> {
    pub(crate) tokenizer: Tokenizer<'de, false>,

    context: &'a Context,
    pub(crate) stack: Stack,
}

impl<'a, 'de> Deserializer<'a, 'de> {
    pub fn new(slice: &'de [u8], context: &'a Context) -> Self {
        let limit = context
            .request_ref::<StackLimit>()
            .map_or(usize::MAX, StackLimit::limit);

        Self {
            tokenizer: Tokenizer::for_json_bytes(slice),
            context,
            stack: Stack::new(limit),
        }
    }

    fn next(&mut self) -> Result<Token<'de>, DeserializerError> {
        let offset = self.tokenizer.offset();
        let Some(token) = self.tokenizer.next() else {
            return Err(Report::new(SyntaxError::UnexpectedEof.into_error())
                .attach(Position::new(offset))
                .change_context(DeserializerError))
        };

        token
            .map_err(|error| convert_tokenizer_error(&error))
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

    pub(crate) fn skip_if(&mut self, token: PeekableTokenKind) -> Option<Range<usize>> {
        let is_token = self.peek() == Some(token);

        is_token.then(|| self.skip())
    }

    pub(crate) fn try_skip(
        &mut self,
        token: PeekableTokenKind,
        error: SyntaxError,
    ) -> Result<(), Error> {
        if self.skip_if(token).is_none() {
            Err(Report::new(error.into_error()).attach(Position::new(self.offset())))
        } else {
            Ok(())
        }
    }

    pub(crate) fn peek(&mut self) -> Option<PeekableTokenKind> {
        self.tokenizer.peek()
    }

    pub(crate) const fn offset(&self) -> usize {
        self.tokenizer.offset()
    }

    pub(crate) fn try_stack_push(&mut self, token: &Token) -> Result<(), DeserializerError> {
        if let Err(error) = self.stack.push() {
            // we can still recover, we pop us again from the stack as we stopped before and do not
            // commit. We still show the error, but we could continue, so we skip all tokens.
            self.stack.pop();
            skip_tokens(&mut self.tokenizer, token);

            return Err(error);
        }

        Ok(())
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
                let value = try_convert_number(&value).change_context(DeserializerError)?;

                visitor.visit_number(value)
            }
            ValueToken::Object => visitor.visit_object(ObjectAccess::new(self)?),
            ValueToken::Array => visitor.visit_array(ArrayAccess::new(self)?),
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
                .visit_number(try_convert_number(&value).change_context(DeserializerError)?)
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
        let token = self.next_value()?;

        match token {
            ValueToken::Array => visitor
                .visit_array(ArrayAccess::new(self)?)
                .change_context(DeserializerError),
            token => Err(self.error_invalid_type(&token, ValueToken::Array.schema())),
        }
    }

    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = self.next_value()?;

        match token {
            ValueToken::Object => visitor
                .visit_object(ObjectAccess::new(self)?)
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
        let token = self.peek();

        let is_map = match token {
            Some(PeekableTokenKind::Object) => {
                // eat the token, so that we're at the key (that we need)
                let _ = self.next();
                true
            }
            Some(_) => false,
            None => {
                return Err(Report::new(SyntaxError::UnexpectedEof.into_error())
                    .attach(Position::new(self.offset()))
                    .change_context(DeserializerError));
            }
        };

        let result = visitor
            .visit_discriminant(&mut *self)
            .change_context(DeserializerError);

        if is_map && result.is_err() {
            // the key is an error, we need to swallow `:` and value
            self.skip_if(PeekableTokenKind::Colon);
            self.skip();
        }

        let discriminant = result?;

        let mut value = if is_map {
            let mut errors = ErrorAccumulator::new();

            if let Err(error) = self.try_skip(PeekableTokenKind::Colon, SyntaxError::ExpectedColon)
            {
                errors.extend_one(error);
            }

            let errors = errors.into_result().change_context(DeserializerError);
            let value = visitor
                .visit_value(discriminant, &mut *self)
                .change_context(DeserializerError);

            // same as folding the tuple in main deer
            match (value, errors) {
                (Err(mut value), Err(errors)) => {
                    value.extend_one(errors);
                    Err(value)
                }
                (Err(error), Ok(_)) | (Ok(_), Err(error)) => Err(error),
                (Ok(value), Ok(_)) => Ok(value),
            }
        } else {
            visitor
                .visit_value(discriminant, NoneDeserializer::new(self.context))
                .change_context(DeserializerError)
        };

        if is_map {
            if self.peek() == Some(PeekableTokenKind::ObjectEnd) {
                // we can safely continue
                // we know this won't error because parsing of `ObjectEnd` will never fail
                let _ = self.next();
            } else {
                // we have received multiple objects, error out
                // make sure we close the object
                self.recover(&ValueToken::Object);

                let error = Report::new(ObjectLengthError.into_error())
                    .attach(ExpectedLength::new(1))
                    .change_context(DeserializerError);

                match &mut value {
                    Err(value) => value.extend_one(error),
                    value => *value = Err(error),
                }
            }
        }

        value
    }

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: StructVisitor<'de>,
    {
        let token = self.next_value()?;

        // JSON should only deserialize objects, not arrays! (even tho technically they could be
        // supported)
        match token {
            ValueToken::Object => visitor
                .visit_object(ObjectAccess::new(self)?)
                .change_context(DeserializerError),

            token => Err(self.error_invalid_type(&token, ValueToken::Object.schema())),
        }
    }

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: IdentifierVisitor<'de>,
    {
        let token = self.next_value()?;

        match token {
            ValueToken::String(value) => match value.decode_if_needed() {
                AnyStr::Owned(value) => visitor.visit_str(&value),
                AnyStr::Borrowed(value) => visitor.visit_str(value),
            }
            .change_context(DeserializerError),

            token => Err(self.error_invalid_type(&token, str::document())),
        }
    }
}
