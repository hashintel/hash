use deer::{
    error::{
        ArrayAccessError, ArrayLengthError, BoundedContractViolationError, ExpectedLength,
        ReceivedLength, Variant,
    },
    Context, Deserialize, Deserializer as _,
};
use error_stack::{Report, Result, ResultExt};

use crate::{
    deserializer::{Deserializer, DeserializerNone},
    token::Token,
};

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

    fn scan_end(&self) -> Option<usize> {
        let mut objects: usize = 0;
        let mut arrays: usize = 0;

        let mut n = 0;

        loop {
            let token = self.deserializer.peek_n(n)?;

            match token {
                Token::Array { .. } => arrays += 1,
                Token::ArrayEnd if arrays == 0 && objects == 0 => {
                    // we're at the outer layer, meaning we can know where we end
                    return Some(n);
                }
                Token::ArrayEnd => arrays = arrays.saturating_sub(1),
                Token::Object { .. } => objects += 1,
                Token::ObjectEnd => objects = objects.saturating_sub(1),
                _ => {}
            }

            n += 1;
        }
    }
}

impl<'de> deer::ArrayAccess<'de> for ArrayAccess<'_, '_, 'de> {
    fn is_dirty(&self) -> bool {
		 self.expected > 0
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
        let mut result = if self.deserializer.peek() == Token::ArrayEnd {
            Ok(())
        } else {
            let mut error = Report::new(ArrayLengthError.into_error())
                .attach(ExpectedLength::new(self.expected));

            if let Some(length) = self.size_hint() {
                error = error.attach(ReceivedLength::new(length));
            }

            Err(error)
        };

        // bump until the very end, which ensures that deserialize calls after this might succeed!
        let bump = self
            .scan_end()
            .map_or_else(|| self.deserializer.tape().remaining(), |index| index + 1);
        self.deserializer.tape_mut().bump_n(bump);

        result.change_context(ArrayAccessError)
    }
}
