use deer::{
    error::{
        BoundedContractViolationError, ExpectedLength, ObjectAccessError, ObjectLengthError,
        ReceivedLength, Variant,
    },
    Deserialize, Deserializer as _, FieldAccess,
};
use error_stack::{Report, Result, ResultExt};

use crate::{
    deserializer::{Deserializer, DeserializerNone},
    tape::Tape,
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

    // This assumes that Str and such are atomic, meaning `Str Str` as a deserialize value is
    // considered invalid, as that should use `ArrayAccess` instead.
    fn scan(&self, key: &str) -> Option<usize> {
        #[derive(Copy, Clone, Eq, PartialEq)]
        enum State {
            Key,
            Value,
        }

        impl State {
            fn flip(&mut self) {
                match *self {
                    Self::Key => *self = Self::Value,
                    Self::Value => *self = Self::Key,
                }
            }
        }

        let mut objects: usize = 0;
        let mut arrays: usize = 0;
        let mut n = 0;

        let mut state = State::Key;

        loop {
            let next = self.deserializer.peek_n(n)?;

            match next {
                Token::Array { .. } => arrays += 1,
                Token::ArrayEnd => arrays = arrays.saturating_sub(1),
                Token::Object { .. } => objects += 1,
                Token::ObjectEnd if objects == 0 && arrays == 0 => {
                    // this is for the outer layer (that's us), therefore we can abort our linear
                    // search
                    return None;
                }
                Token::ObjectEnd => objects = objects.saturating_sub(1),
                Token::Str(value) | Token::BorrowedStr(value) | Token::String(value)
                    if objects == 0 && arrays == 0 && value == key && state == State::Key =>
                {
                    // we found an element that matches the element value that is next in line
                    return Some(n);
                }
                _ => {}
            }

            if arrays == 0 && objects == 0 {
                // we're dependent on the fact if something is a key or value, if we're not nested
                // then we can switch the state.
                state.flip();
            }

            n += 1;
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

    fn value<T>(&mut self, key: &str) -> Result<T, ObjectAccessError>
    where
        T: Deserialize<'de>,
    {
        if self.remaining == Some(0) {
            return T::deserialize(DeserializerNone {
                context: self.deserializer.context(),
            })
            .change_context(ObjectAccessError);
        }

        self.consumed += 1;

        if let Some(remaining) = &mut self.remaining {
            *remaining = remaining.saturating_sub(1);
        }

        match self.scan(key) {
            Some(offset) => {
                // now we need to figure out which values are used, we can do this through offset
                // calculations
                let remaining = self.deserializer.remaining() - offset;

                let tape = self.deserializer.tape().view(offset + 1..);

                let mut deserializer = Deserializer::new_bare(
                    tape.unwrap_or_else(Tape::empty),
                    self.deserializer.context(),
                );

                let value = T::deserialize(&mut deserializer);

                let erase = remaining - deserializer.remaining();
                drop(deserializer);

                self.deserializer.erase(offset..offset + erase);

                value
            }
            None => T::deserialize(DeserializerNone {
                context: self.deserializer.context(),
            }),
        }
        .change_context(ObjectAccessError)
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
                    access
                        .value(&key, DeserializerNone {
                            context: self.deserializer.context(),
                        })
                        .map(|value| (key, value))
                })
            } else {
                return None;
            }
        } else {
            let key = access.key(&mut *self.deserializer);

            key.and_then(|key| {
                access
                    .value(&key, &mut *self.deserializer)
                    .map(|value| (key, value))
            })
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

        result.change_context(ObjectAccessError)
    }
}
