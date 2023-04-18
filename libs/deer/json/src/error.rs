use core::fmt::{Display, Formatter, Write};

use deer::{
    error::{ErrorProperties, ErrorProperty, Id, Location, Namespace, ReceivedValue, Variant},
    id,
};

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
pub(crate) struct OverflowError;

impl Display for OverflowError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str(
            "received a number that was either too large or too small and could not be processed",
        )
    }
}

impl Variant for OverflowError {
    type Properties = (Location, ReceivedValue);

    const ID: Id = id!["number", "overflow"];
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
    ExpectedObjectKey,
    ExpectedColon,
    ExpectedExponent,
    ExpectedDecimalDigit,
    ExpectedString,
    ExpectedNumber,
    UnexpectedByte(u8),
    ObjectKeyMustBeString,
    InvalidHexadecimal,
    InvalidEscape,
    UnclosedObject,
    UnclosedArray,
    UnclosedString,
}

impl Display for SyntaxError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            SyntaxError::InvalidUtf8Sequence => f.write_str("invalid utf-8 sequence"),
            SyntaxError::UnexpectedEof => f.write_str("unexpected end of file"),
            SyntaxError::ExpectedObjectKey => f.write_str("expected object key"),
            SyntaxError::ExpectedColon => f.write_str("expected color (`:`)"),
            SyntaxError::ExpectedExponent => f.write_str("expected exponent sign or digit"),
            SyntaxError::ExpectedDecimalDigit => f.write_str("expected decimal digit"),
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
            SyntaxError::UnclosedObject => f.write_str("expected end of object (`}`)"),
            SyntaxError::UnclosedArray => f.write_str("expected end of array (`]`)"),
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

pub(crate) fn convert_justjson_error(error: justjson::Error) {}
