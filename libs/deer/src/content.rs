use alloc::{borrow::ToOwned, string::String, vec::Vec};

use error_stack::{Result, ResultExt};

use crate::{
    error::{ArrayAccessError, DeserializeError, ObjectAccessError, VisitorError},
    ArrayAccess, Deserialize, Deserializer, Document, Number, ObjectAccess, Visitor,
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

pub struct ContentVisitor;

impl<'de> Visitor<'de> for ContentVisitor {
    type Value = Content<'de>;

    fn expecting(&self) -> Document {
        todo!()
    }

    fn visit_none(self) -> Result<Self::Value, VisitorError> {
        Ok(Content::None)
    }

    fn visit_null(self) -> Result<Self::Value, VisitorError> {
        Ok(Content::Null)
    }

    fn visit_bool(self, v: bool) -> Result<Self::Value, VisitorError> {
        Ok(Content::Bool(v))
    }

    fn visit_number(self, v: Number) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v))
    }

    fn visit_char(self, v: char) -> Result<Self::Value, VisitorError> {
        Ok(Content::Char(v))
    }

    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
        Ok(Content::String(v.to_owned()))
    }

    fn visit_borrowed_str(self, v: &'de str) -> Result<Self::Value, VisitorError> {
        Ok(Content::Str(v))
    }

    fn visit_string(self, v: String) -> Result<Self::Value, VisitorError> {
        Ok(Content::String(v))
    }

    fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
        Ok(Content::ByteBuf(v.to_vec()))
    }

    fn visit_borrowed_bytes(self, v: &'de [u8]) -> Result<Self::Value, VisitorError> {
        Ok(Content::Bytes(v))
    }

    fn visit_bytes_buffer(self, v: Vec<u8>) -> Result<Self::Value, VisitorError> {
        Ok(Content::ByteBuf(v))
    }

    fn visit_array<T>(self, mut v: T) -> Result<Self::Value, VisitorError>
    where
        T: ArrayAccess<'de>,
    {
        let mut array = Vec::with_capacity(size_hint::cautious(v.size_hint()));
        let mut errors: Result<(), ArrayAccessError> = Ok(());

        while let Some(entry) = v.next() {
            match (entry, &mut errors) {
                (Ok(entry), Ok(_)) => array.push(entry),
                // we don't need to allocate if we already have an error
                (Ok(_), Err(_)) => {}
                (Err(error), Err(errors)) => {
                    errors.extend_one(error);
                }
                (Err(error), errors) => *errors = Err(error),
            }
        }

        Ok(Content::Array(array))
    }

    fn visit_object<T>(self, mut v: T) -> Result<Self::Value, VisitorError>
    where
        T: ObjectAccess<'de>,
    {
        let mut object = Vec::with_capacity(size_hint::cautious(v.size_hint()));
        let mut errors: Result<(), ObjectAccessError> = Ok(());

        while let Some(entry) = v.next() {
            match (entry, &mut errors) {
                (Ok(entry), Ok(_)) => object.push(entry),
                // we don't need to allocate if we already have an error
                (Ok(_), Err(_)) => {}
                (Err(error), Err(errors)) => {
                    errors.extend_one(error);
                }
                (Err(error), errors) => *errors = Err(error),
            }
        }

        Ok(Content::Object(object))
    }

    fn visit_i8(self, v: i8) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }

    fn visit_i16(self, v: i16) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }

    fn visit_i32(self, v: i32) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }

    fn visit_i64(self, v: i64) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }

    fn visit_i128(self, v: i128) -> Result<Self::Value, VisitorError> {
        Ok(Content::I128(v))
    }

    fn visit_u8(self, v: u8) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }

    fn visit_u16(self, v: u16) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }

    fn visit_u32(self, v: u32) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }

    fn visit_u64(self, v: u64) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }

    fn visit_u128(self, v: u128) -> Result<Self::Value, VisitorError> {
        Ok(Content::U128(v))
    }

    fn visit_f32(self, v: f32) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }

    fn visit_f64(self, v: f64) -> Result<Self::Value, VisitorError> {
        Ok(Content::Number(v.into()))
    }
}

impl<'de> Deserialize<'de> for Content<'de> {
    type Reflection = ();

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_any(ContentVisitor)
            .change_context(DeserializeError)
    }
}

// TODO: to shortcircuit `Content` (if deserialized multiple times) serde actually uses a
//  `__deserialize_content`
