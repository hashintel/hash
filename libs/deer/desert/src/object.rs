use deer::{
    Context, Deserializer as _, FieldVisitor,
    error::{ObjectAccessError, ObjectLengthError},
};
use error_stack::{Report, ResultExt as _};

use crate::{deserializer::Deserializer, skip::skip_tokens, token::Token};

pub(crate) struct ObjectAccess<'a, 'b, 'de: 'a> {
    deserializer: &'a mut Deserializer<'b, 'de>,

    dirty: bool,
    length: Option<usize>,
    expected: usize,
}

impl<'a, 'b, 'de: 'a> ObjectAccess<'a, 'b, 'de> {
    pub(crate) const fn new(
        deserializer: &'a mut Deserializer<'b, 'de>,
        length: Option<usize>,
    ) -> Self {
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

    fn try_field<F>(&mut self, visitor: F) -> Result<Result<F::Value, Report<ObjectAccessError>>, F>
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

    fn end(self) -> Result<(), Report<ObjectAccessError>> {
        // ensure that we consume the last token, if it is the wrong token error out
        let result = if self.deserializer.peek() == Token::ObjectEnd {
            Ok(())
        } else {
            Err(ObjectLengthError::new(&self, self.expected))
        };

        // bump until the very end, which ensures that deserialize calls after this might succeed!
        skip_tokens(self.deserializer, &Token::Object { length: None });

        result.change_context(ObjectAccessError)
    }
}
