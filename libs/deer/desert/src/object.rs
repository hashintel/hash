use deer::{
    error::{
        BoundedContractViolationError, ExpectedLength, ObjectAccessError, ObjectLengthError,
        ReceivedLength, Variant,
    },
    Deserializer as _, FieldAccess,
};
use error_stack::{Report, Result, ResultExt};

use crate::{
    deserializer::{Deserializer, DeserializerNone},
    token::Token,
};

pub(crate) struct ObjectAccess<'a, 'b, 'de: 'a> {
    deserializer: &'a mut Deserializer<'b, 'de>,

    length: Option<usize>,
    remaining: Option<usize>,
    consumed: usize,
}

impl<'a, 'b, 'de: 'a> ObjectAccess<'a, 'b, 'de> {
    pub(crate) fn new(deserializer: &'a mut Deserializer<'b, 'de>, length: Option<usize>) -> Self {
        Self {
            deserializer,
            length,
            remaining: None,
            consumed: 0,
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
                Token::ArrayEnd => arrays = arrays.saturating_sub(1),
                Token::Object { .. } => objects += 1,
                Token::ObjectEnd if arrays == 0 && objects == 0 => {
                    // we're at the outer layer, meaning we can know where we end
                    return Some(n);
                }
                Token::ObjectEnd => objects = objects.saturating_sub(1),
                _ => {}
            }

            n += 1;
        }
    }
}

impl<'de> deer::ObjectAccess<'de> for ObjectAccess<'_, '_, 'de> {
    fn set_bounded(&mut self, length: usize) -> Result<(), ObjectAccessError> {
        if self.consumed > 0 {
            return Err(
                Report::new(BoundedContractViolationError::SetDirty.into_error())
                    .change_context(ObjectAccessError),
            );
        }

        if self.remaining.is_some() {
            return Err(Report::new(
                BoundedContractViolationError::SetCalledMultipleTimes.into_error(),
            )
            .change_context(ObjectAccessError));
        }

        self.remaining = Some(length);

        Ok(())
    }

    fn field<F>(&mut self, access: F) -> Option<Result<(F::Key, F::Value), ObjectAccessError>>
    where
        F: FieldAccess<'de>,
    {
        if self.remaining == Some(0) {
            return None;
        }

        self.consumed += 1;

        if let Some(remaining) = &mut self.remaining {
            *remaining = remaining.saturating_sub(1);
        }

        let key_value = if self.deserializer.peek() == Token::ObjectEnd {
            // we're not in bounded mode, which means we need to signal that we're done
            self.remaining?;

            if self.remaining.is_some() {
                let key = access.key(DeserializerNone {
                    context: self.deserializer.context(),
                });

                key.and_then(|key| {
                    access.value(key, DeserializerNone {
                        context: self.deserializer.context(),
                    })
                })
            } else {
                return None;
            }
        } else {
            let key = access.key(&mut *self.deserializer);

            key.and_then(|key| access.value(key, &mut *self.deserializer))
        };

        Some(key_value.change_context(ObjectAccessError))
    }

    fn size_hint(&self) -> Option<usize> {
        self.length
    }

    fn end(self) -> Result<(), ObjectAccessError> {
        // ensure that we consume the last token, if it is the wrong token error out
        let mut result = if self.deserializer.peek() == Token::ObjectEnd {
            Ok(())
        } else {
            let mut error = Report::new(ObjectLengthError.into_error())
                .attach(ExpectedLength::new(self.consumed));

            if let Some(length) = self.size_hint() {
                error = error.attach(ReceivedLength::new(length));
            }

            Err(error)
        };

        // bump until the very end, which ensures that deserialize calls after this might succeed!
        let bump = self
            .scan_end()
            .unwrap_or_else(|| self.deserializer.tape().remaining());

        self.deserializer.tape_mut().bump_n(bump + 1);

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

        result.change_context(ObjectAccessError)
    }
}
