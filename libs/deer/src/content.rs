mod deserializer;
mod deserializer_ref;
mod visitor;

use alloc::{borrow::ToOwned, string::String, vec::Vec};

use error_stack::{Report, Result, ResultExt};

use crate::{
    content::visitor::ContentVisitor,
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
