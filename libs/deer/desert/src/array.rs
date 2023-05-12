use deer::{
    error::{ArrayAccessError, ArrayLengthError},
    Context, Deserialize, Deserializer as _,
};
use error_stack::{Result, ResultExt};

use crate::{deserializer::Deserializer, skip::skip_tokens, token::Token};

pub(crate) struct ArrayAccess<'a, 'b, 'de: 'a> {
    deserializer: &'a mut Deserializer<'b, 'de>,

    dirty: bool,
    length: Option<usize>,
    expected: usize,
}

impl<'a, 'b, 'de> ArrayAccess<'a, 'b, 'de> {
    pub(crate) fn new(deserializer: &'a mut Deserializer<'b, 'de>, length: Option<usize>) -> Self {
        Self {
            deserializer,
            dirty: false,
            expected: 0,
            length,
        }
    }
}

impl<'de> deer::ArrayAccess<'de> for ArrayAccess<'_, '_, 'de> {
    fn is_dirty(&self) -> bool {
        self.dirty
    }

    fn context(&self) -> &Context {
        self.deserializer.context()
    }

    fn next<T>(&mut self) -> Option<Result<T, ArrayAccessError>>
    where
        T: Deserialize<'de>,
    {
        self.dirty = true;

        if self.deserializer.peek() == Token::ArrayEnd {
            return None;
        }

        let value = T::deserialize(&mut *self.deserializer);
        self.expected += 1;

        Some(value.change_context(ArrayAccessError))
    }

    fn size_hint(&self) -> Option<usize> {
        self.length
    }

    fn end(self) -> Result<(), ArrayAccessError> {
        // ensure that we consume the last token, if it is the wrong token error out
        let result = if self.deserializer.peek() == Token::ArrayEnd {
            Ok(())
        } else {
            Err(ArrayLengthError::new(&self, self.expected))
        };

        // bump until the very end, which ensures that deserialize calls after this might succeed!
        skip_tokens(self.deserializer, &Token::Array { length: None });

        result.change_context(ArrayAccessError)
    }
}
