use error_stack::{Report, Result, ResultExt};

use crate::{
    content::{invalid_type, Content},
    error::{DeserializerError, TypeError, Variant},
    ext::TupleExt,
    sealed::T,
    Context, Deserialize, Deserializer, EnumVisitor, IdentifierVisitor, Number, OptionalVisitor,
    StructVisitor, Visitor,
};

struct ContentDeserializer<'a, 'de> {
    content: Content<'de>,
    context: &'a mut Context,
}

impl<'a, 'de> ContentDeserializer<'a, 'de> {
    // Reason: `content` and `context` are the correct names. There are no alternatives.
    #[allow(clippy::similar_names)]
    pub fn new(content: Content<'de>, context: &'a mut Context) -> Self {
        Self { content, context }
    }
}

impl<'de> Deserializer<'de> for ContentDeserializer<'_, 'de> {
    fn context(&self) -> &Context {
        &self.context
    }

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.content {
            Content::Bool(value) => visitor.visit_bool(value),
            Content::Number(value) => visitor.visit_number(value),
            Content::I128(value) => visitor.visit_i128(value),
            Content::U128(value) => visitor.visit_u128(value),
            Content::Char(value) => visitor.visit_char(value),
            Content::String(value) => visitor.visit_string(value),
            Content::Str(value) => visitor.visit_borrowed_str(value),
            Content::ByteBuf(value) => visitor.visit_bytes_buffer(value),
            Content::Bytes(value) => visitor.visit_borrowed_bytes(value),
            Content::Null => visitor.visit_null(),
            Content::None => visitor.visit_none(),
            Content::Array(_) => todo!(),  // SeqIterator
            Content::Object(_) => todo!(), // SeqIterator
        }
        .change_context(DeserializerError)
    }

    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.content {
            Content::Null => visitor.visit_null().change_context(DeserializerError),
            received => Err(invalid_type::<<() as Deserialize>::Reflection>(received)
                .change_context(DeserializerError)),
        }
    }

    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.content {
            Content::Bool(value) => visitor.visit_bool(value).change_context(DeserializerError),
            received => Err(invalid_type::<bool>(received).change_context(DeserializerError)),
        }
    }

    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.content {
            Content::Number(value) => visitor
                .visit_number(value)
                .change_context(DeserializerError),
            received => Err(invalid_type::<Number>(received).change_context(DeserializerError)),
        }
    }

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.content {
            Content::Char(value) => visitor.visit_char(value).change_context(DeserializerError),
            Content::String(value) => visitor
                .visit_string(value)
                .change_context(DeserializerError),
            Content::Str(value) => visitor
                .visit_borrowed_str(value)
                .change_context(DeserializerError),
            received => Err(invalid_type::<char>(received).change_context(DeserializerError)),
        }
    }

    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        self.deserialize_str(visitor)
    }

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.content {
            Content::String(value) => visitor
                .visit_str(value.as_str())
                .change_context(DeserializerError),
            Content::Str(value) => visitor
                .visit_borrowed_str(value)
                .change_context(DeserializerError),
            Content::ByteBuf(value) => visitor
                .visit_bytes_buffer(value)
                .change_context(DeserializerError),
            Content::Bytes(value) => visitor
                .visit_borrowed_bytes(value)
                .change_context(DeserializerError),
            received => Err(invalid_type::<bool>(received).change_context(DeserializerError)),
        }
    }

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.content {
            Content::String(value) => visitor
                .visit_str(value.as_str())
                .change_context(DeserializerError),
            Content::Str(value) => visitor
                .visit_borrowed_str(value)
                .change_context(DeserializerError),
            Content::ByteBuf(value) => visitor
                .visit_bytes_buffer(value)
                .change_context(DeserializerError),
            Content::Bytes(value) => visitor
                .visit_borrowed_bytes(value)
                .change_context(DeserializerError),
            Content::Array(value) => todo!(),
            received => Err(invalid_type::<bool>(received).change_context(DeserializerError)),
        }
    }

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        self.deserialize_bytes(visitor)
    }

    fn deserialize_array<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        match self.content {
            Content::Null => visitor.visit_null(),
            Content::None => visitor.visit_none(),
            other => visitor.visit_some(ContentDeserializer::new(other, self.context)),
        }
        .change_context(DeserializerError)
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        let mut errors: Result<(), DeserializerError> = Ok(());

        let (discriminant, value) = match self.content {
            Content::Object(value) => {
                let length = value.len();

                match length {
                    0 => (Content::None, Content::None),
                    1 => value[0],
                    n => {
                        // TODO: better error
                        errors =
                            Err(Report::new(TypeError.into_error())
                                .change_context(DeserializerError));

                        value[0]
                    }
                }
            }
            other => (other, Content::None),
        };

        let context = self.context;

        let discriminant =
            visitor.visit_discriminant(ContentDeserializer::new(discriminant, context));

        match discriminant {
            Ok(discriminant) => {
                let value = visitor
                    .visit_value(discriminant, ContentDeserializer::new(value, context))
                    .change_context(DeserializerError);

                (value, errors).fold_reports().map(|(value, _)| value)
            }
            Err(error) => match errors {
                Err(mut errors) => {
                    errors.extend_one(error.change_context(DeserializerError));
                    Err(errors)
                }
                _ => Err(error.change_context(DeserializerError)),
            },
        }
    }

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: StructVisitor<'de>,
    {
        todo!()
    }

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: IdentifierVisitor<'de>,
    {
        todo!()
    }

    fn __deserialize_content<V>(self, _: T, visitor: V) -> Result<Content<'de>, DeserializerError>
    where
        V: Visitor<'de, Value = Content<'de>>,
    {
        let _ = visitor;

        Ok(self.content)
    }
}
