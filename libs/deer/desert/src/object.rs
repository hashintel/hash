use deer::{
    error::{
        BoundedContractViolationError, ExpectedLength, ObjectAccessError, ObjectLengthError,
        ReceivedLength, Variant,
    },
    Context, Deserializer as _, FieldVisitor,
};
use error_stack::{Report, Result, ResultExt};

use crate::{
    deserializer::{Deserializer, DeserializerNone},
    skip::skip_tokens,
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
}

impl<'de> deer::ObjectAccess<'de> for ObjectAccess<'_, '_, 'de> {
    fn context(&self) -> &Context {
        self.deserializer.context()
    }

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

    fn field<F>(&mut self, access: F) -> Option<Result<F::Value, ObjectAccessError>>
    where
        F: FieldVisitor<'de>,
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
                let key = access.visit_key(DeserializerNone {
                    context: self.deserializer.context(),
                });

                key.and_then(|key| {
                    access.visit_value(key, DeserializerNone {
                        context: self.deserializer.context(),
                    })
                })
            } else {
                return None;
            }
        } else {
            let key = access.visit_key(&mut *self.deserializer);

            if key.is_err() {
                // the key is an error, we need to swallow the value
                let next = self.deserializer.next();
                skip_tokens(self.deserializer, &next);
            }

            key.and_then(|key| access.visit_value(key, &mut *self.deserializer))
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
        skip_tokens(self.deserializer, &Token::Object { length: None });

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
