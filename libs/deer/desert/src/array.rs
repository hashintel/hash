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

    length: Option<usize>,
    remaining: Option<usize>,
    consumed: usize,
}

impl<'a, 'b, 'de> ArrayAccess<'a, 'b, 'de> {
    pub(crate) fn new(deserializer: &'a mut Deserializer<'b, 'de>, length: Option<usize>) -> Self {
        Self {
            deserializer,
            consumed: 0,
            length,
            remaining: None,
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
    fn context(&self) -> &Context {
        self.deserializer.context()
    }

    fn set_bounded(&mut self, length: usize) -> Result<(), ArrayAccessError> {
        if self.consumed > 0 {
            return Err(
                Report::new(BoundedContractViolationError::SetDirty.into_error())
                    .change_context(ArrayAccessError),
            );
        }

        if self.remaining.is_some() {
            return Err(Report::new(
                BoundedContractViolationError::SetCalledMultipleTimes.into_error(),
            )
            .change_context(ArrayAccessError));
        }

        self.remaining = Some(length);

        Ok(())
    }

    fn next<T>(&mut self) -> Option<Result<T, ArrayAccessError>>
    where
        T: Deserialize<'de>,
    {
        if let Some(remaining) = &mut self.remaining {
            if *remaining == 0 {
                return None;
            }

            *remaining = remaining.saturating_sub(1);
        }

        if matches!(self.deserializer.peek(), Token::ArrayEnd) {
            // we have reached the ending, if `self.remaining` is set we use the `DeserializerNone`
            // to deserialize any values that require `None`
            self.remaining.is_some().then(|| {
                // previous statement ensures that remaining is decremented and wasn't 0
                let value = T::deserialize(DeserializerNone {
                    context: self.deserializer.context(),
                });

                self.consumed += 1;
                value.change_context(ArrayAccessError)
            })
        } else {
            let value = T::deserialize(&mut *self.deserializer);
            self.consumed += 1;

            Some(value.change_context(ArrayAccessError))
        }
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
                .attach(ExpectedLength::new(self.consumed));

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

        if let Some(remaining) = self.remaining {
            if remaining > 0 {
                let error =
                    Report::new(BoundedContractViolationError::EndRemainingItems.into_error());

                match &mut result {
                    Err(result) => result.extend_one(error),
                    result => *result = Err(error),
                }
            }
        }

        result.change_context(ArrayAccessError)
    }
}
