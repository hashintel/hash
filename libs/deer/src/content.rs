mod deserializer;
mod deserializer_ref;
mod visitor;

use alloc::{borrow::ToOwned, string::String, vec::Vec};

use error_stack::{Report, Result, ResultExt};

use crate::{
    content::{deserializer::ContentDeserializer, visitor::ContentVisitor},
    error::{
        DeserializeError, Error, ExpectedType, MissingError, ReceivedValue, ValueError, Variant,
    },
    schema::visitor::{ArraySchema, ObjectSchema},
    value::IntoDeserializer,
    Context, Deserialize, Deserializer, Document, Number, Reflection, Schema,
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

impl Content<'_> {
    fn schema(&self) -> Option<Document> {
        match self {
            Self::Bool(_) => Some(Document::new::<bool>()),
            Self::Number(_) => Some(Document::new::<Number>()),
            Self::I128(_) => Some(Document::new::<i128>()),
            Self::U128(_) => Some(Document::new::<u128>()),
            Self::Char(_) => Some(Document::new::<char>()),
            Self::String(_) | Self::Str(_) => Some(Document::new::<str>()),
            Self::ByteBuf(_) | Self::Bytes(_) => Some(Document::new::<[u8]>()),
            Self::Null => Some(Document::new::<<() as Deserialize>::Reflection>()),
            Self::None => None,
            Self::Array(_) => Some(Document::new::<ArraySchema>()),
            Self::Object(_) => Some(Document::new::<ObjectSchema>()),
        }
    }
}

pub struct ContentReflection;

impl Reflection for ContentReflection {
    fn schema(_: &mut Document) -> Schema {
        // TODO: we cannot properly reflect the schema of `Content`, as it accepts any value, and we
        // cannot express ors (or the top type) in any way with the current schema system
        Schema::new("any")
    }
}

impl<'de> Deserialize<'de> for Content<'de> {
    type Reflection = ContentReflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_any(ContentVisitor)
            .change_context(DeserializeError)
    }
}

impl<'de> IntoDeserializer<'de> for Content<'de> {
    type Deserializer<'a> = ContentDeserializer<'a, 'de> where Self: 'a;

    fn into_deserializer<'a>(self, context: &'a Context) -> Self::Deserializer<'a>
    where
        Self: 'a,
    {
        ContentDeserializer::new(self, context)
    }
}

// TODO: OptionalVisitor
// TODO: EnumVisitor
// TODO: FieldVisitor (?)

// TODO: to shortcircuit `Content` (if deserialized multiple times) serde actually uses a
//  `__deserialize_content`

fn invalid_type(received: Content, expecting: Document) -> Report<Error> {
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

    let expected = ExpectedType::new(expecting);

    match received {
        None => Report::new(MissingError.into_error()).attach(expected),
        Some(received) => Report::new(ValueError.into_error())
            .attach(expected)
            .attach(received),
    }
}
