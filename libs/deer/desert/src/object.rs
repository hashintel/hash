use deer::{
    error::{ExpectedLength, ObjectAccessError, ObjectLengthError, ReceivedLength, Variant},
    Context, Deserializer as _, FieldVisitor,
};
use error_stack::{Report, Result, ResultExt};

use crate::{deserializer::Deserializer, skip::skip_tokens, token::Token};

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
        self.dirty = true;

        if self.deserializer.peek() == Token::ObjectEnd {
            return Err(visitor);
        }

        self.expected += 1;

        let key = visitor.visit_key(&mut *self.deserializer);

        if key.is_err() {
            // the key is an error, we need to swallow the value
            let next = self.deserializer.next();
            skip_tokens(self.deserializer, &next);
        }

        let value = key.and_then(|key| visitor.visit_value(key, &mut *self.deserializer));

        Ok(value.change_context(ObjectAccessError))
    }

    fn size_hint(&self) -> Option<usize> {
        self.length
    }

    fn end(self) -> Result<(), ObjectAccessError> {
        // ensure that we consume the last token, if it is the wrong token error out
        let result = if self.deserializer.peek() == Token::ObjectEnd {
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
        skip_tokens(self.deserializer, &Token::Object { length: None });

        result.change_context(ObjectAccessError)
    }
}
