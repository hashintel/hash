use core::fmt::{Debug, Display, Formatter};

use deer::{Deserialize, Document, Number, Reflection, Schema};

// TODO: test
// TODO: this should be `Copy`, but `Number` has no &'static constructor
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    /// A serialized [`bool`]
    ///
    /// ```
    /// use deer_desert::{Token, assert_tokens};
    ///
    /// assert_tokens(&true, &[Token::Bool(true)])
    /// ```
    Bool(bool),

    /// A serialized [`Number`]
    ///
    /// ```
    /// use deer::Number;
    /// use deer_desert::{Token, assert_tokens};
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
    /// use deer_desert::{Token, assert_tokens};
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
    /// use deer_desert::{Token, assert_tokens};
    ///
    /// assert_tokens(&1i128, &[Token::I128(1)])
    /// ```
    I128(i128),

    /// A serialized [`char`]
    ///
    /// ```
    /// use deer_desert::{Token, assert_tokens};
    ///
    /// assert_tokens(&'a', &[Token::Char('a')])
    /// ```
    Char(char),

    /// A serialized [`str`], which does not depend on the lifetime of the deserializer
    ///
    /// ```
    /// use deer::{
    ///     Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
    ///     error::{DeserializeError, VisitorError},
    /// };
    /// use deer_desert::{Token, assert_tokens};
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
    ///         Schema::new("string").with(
    ///             "enum",
    ///             ["trace", "debug", "info", "warn", "error", "critical"],
    ///         )
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
    /// use deer_desert::{Token, assert_tokens};
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
    /// use deer_desert::{Token, assert_tokens};
    ///
    /// assert_tokens(
    ///     &[1u8, 2, 3],
    ///     &[
    ///         Token::Array { length: Some(3) },
    ///         Token::Number(Number::from(1)),
    ///         Token::Number(Number::from(2)),
    ///         Token::Number(Number::from(3)),
    ///         Token::ArrayEnd,
    ///     ],
    /// );
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
    fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
        Debug::fmt(self, fmt)
    }
}

struct AnyArray;

impl Reflection for AnyArray {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("array")
    }
}

struct AnyObject;

impl Reflection for AnyObject {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("object")
    }
}

impl Token {
    pub(crate) fn schema(&self) -> Document {
        match self {
            Self::Bool(_) => Document::new::<bool>(),
            Self::Number(_) => Document::new::<Number>(),
            Self::U128(_) => Document::new::<u128>(),
            Self::I128(_) => Document::new::<i128>(),
            Self::Char(_) => Document::new::<char>(),
            Self::Str(_) | Self::BorrowedStr(_) | Self::String(_) => Document::new::<str>(),
            Self::Bytes(_) | Self::BorrowedBytes(_) | Self::BytesBuf(_) => Document::new::<[u8]>(),
            Self::Array { .. } | Self::ArrayEnd => Document::new::<AnyArray>(),
            Self::Object { .. } | Self::ObjectEnd => Document::new::<AnyObject>(),
            Self::Null => Document::new::<<() as Deserialize>::Reflection>(),
        }
    }
}

// TODO: maybe number
// TODO: IdentifierVisitor (u8, u64, str, borrowed_str, string,
//  bytes, bytes_buf, borrowed_bytes)
// TODO: test
