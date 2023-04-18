use core::fmt::{Display, Formatter, Write};

use deer::{
    error::{ErrorProperties, ErrorProperty, Id, Location, Namespace, ReceivedValue, Variant},
    id,
};
use error_stack::Report;
use justjson::ErrorKind;

const NAMESPACE: Namespace = Namespace::new("deer-json");

#[derive(Debug)]
pub(crate) struct BytesUnsupportedError;

impl Display for BytesUnsupportedError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str("deer-json does not support deserialization of bytes")
    }
}

impl Variant for BytesUnsupportedError {
    type Properties = (Location,);

    const ID: Id = id!["bytes"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        _: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> core::fmt::Result {
        fmt.write_str("deer-json does not support deserialization of bytes")
    }
}

#[derive(Debug)]
pub enum NumberError {
    Overflow,
    Underflow,
    Unknown,
}

impl Display for NumberError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Overflow => f.write_str("number too large"),
            Self::Underflow => f.write_str("number too small"),
            Self::Unknown => f.write_str("unable to parse number"),
        }
    }
}

impl Variant for NumberError {
    type Properties = (Location, ReceivedValue);

    const ID: Id = id!["number"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        _: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> core::fmt::Result {
        Display::fmt(&self, fmt)?;

        #[cfg(debug_assertions)]
        fmt.write_str(", try enabling the `arbitrary-precision` feature")?;

        Ok(())
    }
}

// TODO: RecursionLimit our own error

pub struct Position {
    offset: usize,
}

impl Position {
    pub(crate) const fn new(offset: usize) -> Self {
        Self { offset }
    }
}

impl ErrorProperty for Position {
    type Value<'a> = Option<usize> where Self: 'a ;

    fn key() -> &'static str {
        "position"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next().map(|Position { offset }| *offset)
    }
}

#[derive(Debug, Copy, Clone)]
pub enum SyntaxError {
    InvalidUtf8Sequence,
    UnexpectedEof,
    ExpectedColon,
    ExpectedExponent,
    ExpectedDecimalDigit,
    ExpectedDigit,
    ExpectedString,
    ExpectedNumber,
    UnexpectedByte(u8),
    ObjectKeyMustBeString,
    InvalidHexadecimal,
    InvalidEscape,
    // we need to create those ourselves!
    // UnclosedObject,
    // UnclosedArray,
    // TODO: trailing non whitespace?
    UnclosedString,
}

impl Display for SyntaxError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            SyntaxError::InvalidUtf8Sequence => f.write_str("invalid utf-8 sequence"),
            SyntaxError::UnexpectedEof => f.write_str("unexpected end of file"),
            SyntaxError::ExpectedColon => f.write_str("expected color (`:`)"),
            SyntaxError::ExpectedExponent => f.write_str("expected exponent sign or digit"),
            SyntaxError::ExpectedDecimalDigit => f.write_str("expected decimal digit"),
            SyntaxError::ExpectedDigit => f.write_str("expected decimal digit"),
            // TODO: do those even matter?
            SyntaxError::ExpectedString => f.write_str("expected string"),
            SyntaxError::ExpectedNumber => f.write_str("expected number"),
            SyntaxError::UnexpectedByte(character) => {
                f.write_fmt(format_args!("unexpected byte (`{character}`)"))
            }
            SyntaxError::ObjectKeyMustBeString => f.write_str("object keys must be string"),
            SyntaxError::InvalidHexadecimal => {
                f.write_str("invalid hexadecimal in unicode escape sequence")
            }
            SyntaxError::InvalidEscape => f.write_str("invalid escape character"),
            SyntaxError::UnclosedString => f.write_str(r#"expected end of string (`"`)"#),
        }
    }
}

impl Variant for SyntaxError {
    type Properties = (Location, Position);

    const ID: Id = id!["syntax"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> core::fmt::Result {
        let position = properties.1;

        // TODO: context via codespan -> Property (if fancy)
        if let Some(position) = position {
            fmt.write_fmt(format_args!("{self} at {position}"))
        } else {
            Display::fmt(&self, fmt)
        }
    }
}

#[derive(Debug, Clone)]
pub struct NativeError(justjson::ErrorKind);

impl Display for NativeError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        Display::fmt(&self.0, f)
    }
}

impl Variant for NativeError {
    type Properties = (Location,);

    const ID: Id = id!["syntax", "native"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        _: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> core::fmt::Result {
        Display::fmt(&self, fmt)
    }
}

pub(crate) fn convert_tokenizer_error(error: justjson::Error) -> Report<deer::error::Error> {
    let offset = error.offset();

    let error = match error.kind() {
        ErrorKind::Utf8 => SyntaxError::InvalidUtf8Sequence.into_error(),
        ErrorKind::UnexpectedEof => SyntaxError::UnexpectedEof.into_error(),
        ErrorKind::ExpectedColon => SyntaxError::ExpectedColon.into_error(),
        ErrorKind::Unexpected(v) => SyntaxError::UnexpectedByte(*v).into_error(),
        ErrorKind::ExpectedExponent => SyntaxError::ExpectedExponent.into_error(),
        ErrorKind::ExpectedDecimalDigit => SyntaxError::ExpectedDecimalDigit.into_error(),
        ErrorKind::ExpectedDigit => SyntaxError::ExpectedDigit.into_error(),
        ErrorKind::InvalidHexadecimal => SyntaxError::InvalidHexadecimal.into_error(),
        ErrorKind::InvalidEscape => SyntaxError::InvalidEscape.into_error(),
        ErrorKind::UnclosedString => SyntaxError::UnclosedString.into_error(),
        ErrorKind::ExpectedString => SyntaxError::ExpectedString.into_error(),
        ErrorKind::ExpectedNumber => SyntaxError::ExpectedNumber.into_error(),
        kind => NativeError(kind.clone()).into_error(),
    };

    Report::new(error).attach(Position::new(offset))
}
