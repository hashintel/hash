mod visitor;

use alloc::{borrow::ToOwned, string::String, vec::Vec};

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        ArrayAccessError, DeserializeError, DeserializerError, Error, ExpectedType, MissingError,
        ObjectAccessError, ReceivedValue, TypeError, ValueError, Variant, VisitorError,
    },
    ext::TupleExt,
    sealed::T,
    ArrayAccess, Context, Deserialize, Deserializer, Document, EnumVisitor, Number, ObjectAccess,
    OptionalVisitor, Reflection, Visitor,
};

mod size_hint {
    use core::cmp;

    pub(crate) fn cautious(hint: Option<usize>) -> usize {
        cmp::min(hint.unwrap_or(0), 4096)
    }
}

#[derive(Debug, Clone)]
pub enum Content<'de> {
    Bool(bool),

    Number(Number),
    I128(i128),
    U128(u128),

    Char(char),
    String(String),
    Str(&'de str),

    ByteBuf(Vec<u8>),
    Bytes(&'de [u8]),

    Null,
    None,

    Array(Vec<Content<'de>>),
    Object(Vec<(Content<'de>, Content<'de>)>),
}

impl<'de> Deserialize<'de> for Content<'de> {
    type Reflection = ();

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_any(ContentVisitor)
            .change_context(DeserializeError)
    }
}

// TODO: OptionalVisitor
// TODO: EnumVisitor
// TODO: FieldVisitor (?)
// TODO: Reflection c:

// TODO: to shortcircuit `Content` (if deserialized multiple times) serde actually uses a
//  `__deserialize_content`

fn invalid_type<T: Reflection + ?Sized>(received: Content) -> Report<Error> {
    let received = match received {
        Content::Bool(value) => Some(ReceivedValue::new(value)),
        Content::Number(value) => Some(ReceivedValue::new(value)),
        Content::I128(value) => Some(ReceivedValue::new(value)),
        Content::U128(value) => Some(ReceivedValue::new(value)),
        Content::Char(value) => Some(ReceivedValue::new(value)),
        Content::String(value) => Some(ReceivedValue::new(value)),
        Content::Str(value) => Some(ReceivedValue::new(value.to_owned())),
        Content::ByteBuf(value) => Some(ReceivedValue::new(value)),
        Content::Bytes(value) => Some(ReceivedValue::new(value.to_vec())),
        Content::Null => Some(ReceivedValue::new(())),
        Content::None => None,
        // TODO: we need to "remove" `None` from the serialization
        Content::Array(value) => todo!(),
        Content::Object(value) => todo!(),
    };

    let expected = ExpectedType::new(T::document());

    match received {
        None => Report::new(MissingError.into_error()).attach(expected),
        Some(received) => Report::new(ValueError.into_error())
            .attach(expected)
            .attach(received),
    }
}

struct ContentDeserializer<'a, 'de> {
    content: Content<'de>,
    context: &'a mut Context,
}

impl<'a, 'de> ContentDeserializer<'a, 'de> {
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

    fn __deserialize_content<V>(self, _: T, visitor: V) -> Result<Content<'de>, DeserializerError>
    where
        V: Visitor<'de, Value = Content<'de>>,
    {
        let _ = visitor;

        Ok(self.content)
    }
}

struct ContentRefDeserializer<'a, 'de: 'a> {
    content: &'a Content<'de>,
    context: &'a mut Context,
}

impl<'de> Deserializer<'de> for ContentRefDeserializer<'_, 'de> {
    fn context(&self) -> &Context {
        &self.context
    }

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
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
        todo!()
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        todo!()
    }

    // TODO: is there a better way? I don't think without specialization (default impl)
    fn __deserialize_content<V>(self, _: T, visitor: V) -> Result<Content<'de>, DeserializerError>
    where
        V: Visitor<'de, Value = Content<'de>>,
    {
        let _ = visitor;

        Ok(self.content.clone())
    }
}
