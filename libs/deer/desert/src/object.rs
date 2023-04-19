use deer::{
    error::{
        BoundedContractViolationError, ExpectedLength, ObjectAccessError, ObjectLengthError,
        ReceivedLength, Variant,
    },
    Deserializer as _, FieldVisitor,
};
use error_stack::{Report, Result, ResultExt};

use crate::{
    deserializer::{Deserializer, DeserializerNone},
    token::Token,
};

pub(crate) struct ObjectAccess<'a, 'b, 'de: 'a> {
    deserializer: &'a mut Deserializer<'b, 'de>,

    dirty: bool,
    length: Option<usize>,
    expected: usize,
}

impl<'a, 'b, 'de: 'a> ObjectAccess<'a, 'b, 'de> {
    pub(crate) fn new(deserializer: &'a mut Deserializer<'b, 'de>, length: Option<usize>) -> Self {
        Self {
            deserializer,

            dirty: false,
            length,
            expected: 0,
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
    fn is_dirty(&self) -> bool {
        self.dirty
    }

    fn field<F>(&mut self, access: F) -> Option<Result<F::Value, ObjectAccessError>>
    where
        F: FieldVisitor<'de>,
    {
        self.dirty = true;

        if self.deserializer.peek() == Token::ObjectEnd {
            return None;
        }

        let key = access.visit_key(&mut *self.deserializer);
        let value = key.and_then(|key| access.visit_value(key, &mut *self.deserializer));

        self.expected += 1;

        Some(value.change_context(ObjectAccessError))
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
                .attach(ExpectedLength::new(self.expected));

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

        result.change_context(ObjectAccessError)
    }
}
