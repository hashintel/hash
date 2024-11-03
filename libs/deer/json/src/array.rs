use deer::{
    Context, Deserialize, Deserializer as _,
    error::{ArrayAccessError, ArrayLengthError, DeserializerError, Error, Variant as _},
};
use error_stack::{Report, ReportSink, ResultExt as _};
use justjson::parser::{PeekableTokenKind, Token};

use crate::{
    deserializer::Deserializer,
    error::{Position, SyntaxError},
    skip::skip_tokens,
};

pub(crate) struct ArrayAccess<'a, 'b, 'de: 'a> {
    deserializer: &'a mut Deserializer<'b, 'de>,

    dirty: bool,
    expected: usize,
}

impl<'a, 'b, 'de: 'a> ArrayAccess<'a, 'b, 'de> {
    pub(crate) fn new(
        deserializer: &'a mut Deserializer<'b, 'de>,
    ) -> Result<Self, Report<DeserializerError>> {
        deserializer.try_stack_push(&Token::Array)?;

        Ok(Self {
            deserializer,
            dirty: false,
            expected: 0,
        })
    }

    fn try_skip_comma(&mut self) -> Result<(), Report<Error>> {
        self.deserializer
            .try_skip(PeekableTokenKind::Comma, SyntaxError::ExpectedComma)
    }
}

impl<'de> deer::ArrayAccess<'de> for ArrayAccess<'_, '_, 'de> {
    fn is_dirty(&self) -> bool {
        self.dirty
    }

    fn context(&self) -> &Context {
        self.deserializer.context()
    }

    fn next<T>(&mut self) -> Option<Result<T, Report<ArrayAccessError>>>
    where
        T: Deserialize<'de>,
    {
        let mut errors = ReportSink::new();

        if self.dirty {
            // we parse in a way where every subsequent invocation (except the first one)
            // needs to parse the `,` that is the token, if that token is not present we will error
            // out, but(!) will still attempt deserialization, as we can tolerate that error.

            // the statement after this _will_ fail and return the visitor, therefore we don't
            // need to check for EOF
            if let Err(error) = self.try_skip_comma() {
                errors.append(error);
            }
        }

        if let Err(error) = errors.finish() {
            return Some(Err(error.change_context(ArrayAccessError)));
        }

        self.dirty = true;

        let peek_key = self.deserializer.peek();

        // we check for `is_none` here because we could be EOF, in that case we're "done", we will
        // error out at `.end()`
        if peek_key.is_none() || peek_key == Some(PeekableTokenKind::ArrayEnd) {
            return None;
        }

        self.expected += 1;

        let value = T::deserialize(&mut *self.deserializer);

        Some(value.change_context(ArrayAccessError))
    }

    fn size_hint(&self) -> Option<usize> {
        None
    }

    fn end(self) -> Result<(), Report<ArrayAccessError>> {
        self.deserializer.stack.pop();

        let result = match self.deserializer.peek() {
            None => Err(Report::new(SyntaxError::UnexpectedEof.into_error())
                .attach(Position::new(self.deserializer.offset()))),
            Some(PeekableTokenKind::ArrayEnd) => Ok(()),
            Some(_) => Err(ArrayLengthError::new(&self, self.expected)),
        };

        skip_tokens(&mut self.deserializer.tokenizer, &Token::Array);

        result.change_context(ArrayAccessError)
    }
}
