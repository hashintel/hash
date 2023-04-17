use core::fmt::{Debug, Display, Formatter};

use deer::Number;

// TODO: test
// TODO: this should be `Copy`, but `Number` has no &'static constructor
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    /// A serialized [`bool`]
    ///
    /// ```
    /// use deer_desert::{assert_tokens, Token};
    ///
    /// assert_tokens(&true, &[Token::Bool(true)])
    /// ```
    Bool(bool),

    /// A serialized [`Number`]
    ///
    /// ```
    /// use deer::Number;
    /// use deer_desert::{assert_tokens, Token};
    ///
    /// assert_tokens(&Number::from(1), &[Token::Number(Number::from(1))])
    /// ```
    Number(Number),

    /// A serialized [`u128`]
    ///
    /// this is a separate variant, as [`Number`] is unable to fully represent 128 bit values, this
    /// means that u128/i128 need special support.
    ///
    /// ```
    /// use deer_desert::{assert_tokens, Token};
    ///
    /// assert_tokens(&1u128, &[Token::U128(1)])
    /// ```
    U128(u128),

    /// A serialized [`i128`]
    ///
    /// this is a separate variant, as [`Number`] is unable to fully represent 128 bit values, this
    /// means that u128/i128 need special support.
    ///
    /// ```
    /// use deer_desert::{assert_tokens, Token};
    ///
    /// assert_tokens(&1i128, &[Token::I128(1)])
    /// ```
    I128(i128),

    /// A serialized [`usize`]
    ///
    /// this is a separate variant, because there is no guarantee about the width of a usize/isize,
    /// it depends on the size to reference a memory address on the host system. There might be
    /// systems that use 128 bit in the future that rust supports, which means we too need to
    /// support those, by special casing usize.
    ///
    /// ```
    /// use deer_desert::{assert_tokens, Token};
    ///
    /// assert_tokens(&1usize, &[Token::USize(1)])
    /// ```
    USize(usize),

    /// A serialized [`isize`]
    ///
    /// this is a separate variant, because there is no guarantee about the width of a usize/isize,
    /// it depends on the size to reference a memory address on the host system. There might be
    /// systems that use 128 bit in the future that rusts supports, which means we too need to
    /// support those, by special casing isize/usize.
    ///
    /// ```
    /// use deer_desert::{assert_tokens, Token};
    ///
    /// assert_tokens(&1isize, &[Token::ISize(1)])
    /// ```
    ISize(isize),

    /// A serialized [`char`]
    ///
    /// ```
    /// use deer_desert::{assert_tokens, Token};
    ///
    /// assert_tokens(&'a', &[Token::Char('a')])
    /// ```
    Char(char),

    /// A serialized [`str`], which does not depend on the lifetime of the deserializer
    ///
    /// ```
    /// use deer::{
    ///     error::{DeserializeError, VisitorError},
    ///     Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
    /// };
    /// use deer_desert::{assert_tokens, Token};
    /// use error_stack::ResultExt;
    ///
    /// #[derive(Debug, PartialEq, serde::Serialize)]
    /// pub enum LogLevel {
    ///     Trace,
    ///     Debug,
    ///     Info,
    ///     Warn,
    ///     Error,
    ///     Critical,
    ///     Unknown,
    /// }
    ///
    /// struct LogLevelVisitor;
    ///
    /// impl<'de> Visitor<'de> for LogLevelVisitor {
    ///     type Value = LogLevel;
    ///
    ///     fn expecting(&self) -> Document {
    ///         Self::Value::reflection()
    ///     }
    ///
    ///     fn visit_str(self, value: &str) -> error_stack::Result<Self::Value, VisitorError> {
    ///         match value {
    ///             "trace" => Ok(LogLevel::Trace),
    ///             "debug" => Ok(LogLevel::Debug),
    ///             "info" => Ok(LogLevel::Info),
    ///             "warn" => Ok(LogLevel::Warn),
    ///             "error" => Ok(LogLevel::Error),
    ///             "critical" => Ok(LogLevel::Critical),
    ///             _ => Ok(LogLevel::Unknown),
    ///         }
    ///     }
    /// }
    ///
    /// impl Reflection for LogLevel {
    ///     fn schema(doc: &mut Document) -> Schema {
    ///         Schema::new("string").with("enum", [
    ///             "trace", "debug", "info", "warn", "error", "critical",
    ///         ])
    ///     }
    /// }
    ///
    /// impl<'de> Deserialize<'de> for LogLevel {
    ///     type Reflection = Self;
    ///
    ///     fn deserialize<D: Deserializer<'de>>(
    ///         deserializer: D,
    ///     ) -> error_stack::Result<Self, DeserializeError> {
    ///         deserializer
    ///             .deserialize_str(LogLevelVisitor)
    ///             .change_context(DeserializeError)
    ///     }
    /// }
    ///
    /// assert_tokens(&LogLevel::Critical, &[Token::Str("critical")])
    /// ```
    Str(&'static str),

    /// A serialized [`str`]
    ///
    /// ```
    /// use deer_desert::{assert_tokens, Token};
    /// let test = "example";
    ///
    /// assert_tokens(&test, &[Token::BorrowedStr(test)])
    /// ```
    BorrowedStr(&'static str),

    String(&'static str),

    Bytes(&'static [u8]),

    BorrowedBytes(&'static [u8]),

    BytesBuf(&'static [u8]),

    /// A serialized array or tuple
    ///
    /// ```
    /// use deer::Number;
    /// use deer_desert::{assert_tokens, Token};
    ///
    /// assert_tokens(&[1u8, 2, 3], &[
    ///     Token::Array { length: Some(3) },
    ///     Token::Number(Number::from(1)),
    ///     Token::Number(Number::from(2)),
    ///     Token::Number(Number::from(3)),
    ///     Token::ArrayEnd,
    /// ]);
    /// ```
    Array {
        length: Option<usize>,
    },

    /// Token which ends an array.
    ///
    /// For a well-formed stream each [`Self::Array`] token must have a [`Self::ArrayEnd`]
    /// counterpart down the line.
    ArrayEnd,

    Object {
        length: Option<usize>,
    },

    ObjectEnd,

    Null,
}

impl Display for Token {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        Debug::fmt(self, f)
    }
}
