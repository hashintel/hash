use core::fmt::{Debug, Display, Formatter};

use deer::Number;

// TODO: test
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum Token {
    /// A serialized `bool`
    ///
    /// ```
    /// # use error_stack::ResultExt;
    /// use deer::{
    ///     error::{DeserializeError, VisitorError},
    ///     Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
    /// };
    /// use deer_desert::{assert_tokens, Token};
    ///
    /// #[derive(Debug, PartialEq)]
    /// struct Bool(bool);
    ///
    /// impl Reflection for Bool {
    ///     fn schema(_: &mut Document) -> Schema {
    ///         Schema::new("boolean")
    ///     }
    /// }
    ///
    /// impl<'de> Deserialize<'de> for Bool {
    ///     type Reflection = Self;
    ///
    ///     fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
    ///         struct BoolVisitor;
    ///
    ///         impl<'de> Visitor<'de> for BoolVisitor {
    ///             type Value = Bool;
    ///
    ///             fn expecting(&self) -> Document {
    ///                 Bool::reflection()
    ///             }
    ///
    ///             fn visit_bool(self, v: bool) -> error_stack::Result<Self::Value, VisitorError> {
    ///                 Ok(Bool(v))
    ///             }
    ///         }
    ///
    ///         de.deserialize_bool(BoolVisitor)
    ///             .change_context(DeserializeError)
    ///     }
    /// }
    ///
    /// assert_tokens(&Bool(true), &[Token::Bool(true)])
    /// ```
    Bool(bool),
    Number(&'static Number),
    Char(char),
    Str(&'static str),
    BorrowedStr(&'static str),
    String(&'static str),
    Bytes(&'static [u8]),
    BorrowedBytes(&'static [u8]),
    BytesBuf(&'static [u8]),
    Array {
        length: Option<usize>,
    },
    ArrayEnd,
    Object {
        length: Option<usize>,
    },
    ObjectEnd,
}

impl Display for Token {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        Debug::fmt(self, f)
    }
}
