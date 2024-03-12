use deer::{
    error::{DeserializerError, Error, ObjectAccessError, ObjectLengthError, Variant},
    Context, Deserializer as _, FieldVisitor,
};
use error_stack::{Report, Result, ResultExt};
use justjson::parser::{PeekableTokenKind, Token};

use crate::{
    deserializer::Deserializer,
    error::{ErrorAccumulator, Position, Span, SyntaxError},
    skip::skip_tokens,
};

pub(crate) struct ObjectAccess<'a, 'b, 'de: 'a> {
    deserializer: &'a mut Deserializer<'b, 'de>,

    dirty: bool,
    expected: usize,
}

impl<'a, 'b, 'de: 'a> ObjectAccess<'a, 'b, 'de> {
    pub(crate) fn new(
        deserializer: &'a mut Deserializer<'b, 'de>,
    ) -> Result<Self, DeserializerError> {
        deserializer.try_stack_push(&Token::Object)?;

        Ok(Self {
            deserializer,

            dirty: false,
            expected: 0,
        })
    }

    pub(crate) fn try_skip_colon(&mut self) -> Result<(), Error> {
        // skip `:`, be tolerant if someone forgot, but still propagate the error
        self.deserializer
            .try_skip(PeekableTokenKind::Colon, SyntaxError::ExpectedColon)
    }

    pub(crate) fn try_skip_comma(&mut self) -> Result<(), Error> {
        self.deserializer
            .try_skip(PeekableTokenKind::Comma, SyntaxError::ExpectedComma)
    }
}

impl<'de> deer::ObjectAccess<'de> for ObjectAccess<'_, '_, 'de> {
    fn is_dirty(&self) -> bool {
        self.dirty
    }

    fn context(&self) -> &Context {
        self.deserializer.context()
    }

    fn try_field<F>(
        &mut self,
        visitor: F,
    ) -> core::result::Result<Result<F::Value, ObjectAccessError>, F>
    where
        F: FieldVisitor<'de>,
    {
        let mut errors = ErrorAccumulator::new();

        if self.dirty {
            // we parse in a way where every subsequent invocation (except the first one)
            // needs to parse the `,` that is the token, if that token is not present we will error
            // out, but(!) will still attempt deserialization, as we can tolerate that error.

            // the statement after this _will_ fail and return the visitor, therefore we don't
            // need to check for EOF
            if let Err(error) = self.try_skip_comma() {
                errors.extend_one(error);
            }
        }

        self.dirty = true;

        let peek_key = self.deserializer.peek();

        // we check for `is_none` here because we could be EOF, in that case we still error out with
        // the visitor as we're "done".
        if peek_key.is_none() || peek_key == Some(PeekableTokenKind::ObjectEnd) {
            return Err(visitor);
        }

        self.expected += 1;

        // only strings are valid, therefore we skip both tokens and error out!
        if peek_key != Some(PeekableTokenKind::String) {
            let span = self.deserializer.skip(); // skip key

            if let Err(skip) = self.try_skip_colon() {
                errors.extend_one(skip);
            }

            self.deserializer.skip(); // skip value

            let error = errors.extend_existing(
                Report::new(SyntaxError::ObjectKeyMustBeString.into_error())
                    .attach(Span::new(span)),
            );

            return Ok(Err(error.change_context(ObjectAccessError)));
        }

        let key = visitor.visit_key(&mut *self.deserializer);

        let result = match key {
            Ok(key) => visitor
                .visit_value(key, &mut *self.deserializer)
                .change_context(ObjectAccessError),
            Err(error) => {
                let mut error = error.change_context(ObjectAccessError);

                if let Err(skip) = self.try_skip_colon() {
                    error.extend_one(skip.change_context(ObjectAccessError));
                }

                self.deserializer.skip(); // skip value

                Err(error)
            }
        };

        // key value are separated by `:`, if one forgets we will still error out but _try_ to
        // deserialize
        if let Err(skip) = self.try_skip_colon() {
            errors.extend_one(skip);
        }

        // same as `(result, errors).into_result()`
        let result = match (
            result,
            errors.into_result().change_context(ObjectAccessError),
        ) {
            (Err(error), Ok(())) | (Ok(_), Err(error)) => Err(error),
            (Err(mut result), Err(errors)) => {
                result.extend_one(errors);
                Err(result)
            }
            (Ok(result), Ok(())) => Ok(result),
        };

        Ok(result)
    }

    fn size_hint(&self) -> Option<usize> {
        None
    }

    fn end(self) -> Result<(), ObjectAccessError> {
        self.deserializer.stack.pop();

        let result = match self.deserializer.peek() {
            None => Err(Report::new(SyntaxError::UnexpectedEof.into_error())
                .attach(Position::new(self.deserializer.offset()))),
            Some(PeekableTokenKind::ObjectEnd) => Ok(()),
            Some(_) => Err(ObjectLengthError::new(&self, self.expected)),
        };

        skip_tokens(&mut self.deserializer.tokenizer, &Token::Object);

        result.change_context(ObjectAccessError)
    }
}
