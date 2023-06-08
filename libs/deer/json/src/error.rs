use core::{
    fmt::{Display, Formatter},
    ops::Range,
};

#[cfg(not(feature = "arbitrary-precision"))]
use deer::error::ReceivedValue;
use deer::{
    error::{ErrorProperties, ErrorProperty, Id, Location, Namespace, Variant},
    id,
};
use error_stack::Report;
use justjson::ErrorKind;

const NAMESPACE: Namespace = Namespace::new("deer-json");

#[derive(Debug)]
pub(crate) struct RecursionLimitError;

impl Display for RecursionLimitError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        // This message is vague by design to not encourage abuse from the consumers
        f.write_str("Recursion limit has been exceeded")
    }
}

impl Variant for RecursionLimitError {
    type Properties = (Location,);

    const ID: Id = id!["recursion"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        _: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> core::fmt::Result {
        Display::fmt(self, fmt)
    }
}

#[derive(Debug)]
pub(crate) struct BytesUnsupportedError;

impl Display for BytesUnsupportedError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str("JSON does not support bytes")
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

#[cfg(not(feature = "arbitrary-precision"))]
#[derive(Debug)]
pub(crate) enum NumberError {
    Overflow,
    Underflow,
    Unknown,
}

#[cfg(not(feature = "arbitrary-precision"))]
impl Display for NumberError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Overflow => f.write_str("number too large"),
            Self::Underflow => f.write_str("number too small"),
            Self::Unknown => f.write_str("unable to parse number"),
        }
    }
}

#[cfg(not(feature = "arbitrary-precision"))]
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

pub(crate) struct Position {
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
        stack.next().map(|Self { offset }| *offset)
    }
}

pub(crate) struct Span {
    range: Range<usize>,
}

impl Span {
    pub(crate) fn new(range: impl Into<Range<usize>>) -> Self {
        Self {
            range: range.into(),
        }
    }
}

impl ErrorProperty for Span {
    type Value<'a> = Option<&'a Range<usize>> where Self: 'a ;

    fn key() -> &'static str {
        "span"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next().map(|Self { range }| range)
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) enum SyntaxError {
    InvalidUtf8Sequence,
    UnexpectedEof,
    ExpectedColon,
    ExpectedComma,
    ExpectedExponent,
    ExpectedDecimalDigit,
    ExpectedDigit,
    ExpectedString,
    ExpectedNumber,
    UnexpectedByte(u8),
    ObjectKeyMustBeString,
    InvalidHexadecimal,
    InvalidEscape,
    // TODO: trailing non whitespace?
    UnclosedString,
}

impl Display for SyntaxError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::InvalidUtf8Sequence => f.write_str("invalid utf-8 sequence"),
            Self::UnexpectedEof => f.write_str("unexpected end of file"),
            Self::ExpectedColon => f.write_str("expected colon (`:`)"),
            Self::ExpectedComma => f.write_str("expected comma (`,`)"),
            Self::ExpectedExponent => f.write_str("expected exponent sign or digit"),
            Self::ExpectedDigit | Self::ExpectedDecimalDigit => {
                f.write_str("expected decimal digit")
            }
            // TODO: do those even matter?
            Self::ExpectedString => f.write_str("expected string"),
            Self::ExpectedNumber => f.write_str("expected number"),
            Self::UnexpectedByte(character) => {
                f.write_fmt(format_args!("unexpected byte (`{character}`)"))
            }
            Self::ObjectKeyMustBeString => f.write_str("object keys must be string"),
            Self::InvalidHexadecimal => {
                f.write_str("invalid hexadecimal in unicode escape sequence")
            }
            Self::InvalidEscape => f.write_str("invalid escape character"),
            Self::UnclosedString => f.write_str(r#"expected end of string (`"`)"#),
        }
    }
}

impl Variant for SyntaxError {
    type Properties = (Location, Position, Span);

    const ID: Id = id!["syntax"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> core::fmt::Result {
        let position = properties.1;
        let span = properties.2;

        // TODO: context via codespan -> Property (if fancy)
        if let Some(position) = position {
            fmt.write_fmt(format_args!("{self} at {position}"))
        } else if let Some(span) = span {
            let Range { start, end } = span;
            fmt.write_fmt(format_args!("{self} at {start}..{end}"))
        } else {
            Display::fmt(&self, fmt)
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct NativeError(justjson::ErrorKind);

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

pub(crate) fn convert_tokenizer_error(error: &justjson::Error) -> Report<deer::error::Error> {
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

// In theory we could use `DropBomb` here to require that the accumulator is used
#[must_use]
pub(crate) struct ErrorAccumulator<C> {
    inner: Option<Report<C>>,
}

impl<C> ErrorAccumulator<C> {
    pub(crate) const fn new() -> Self {
        Self { inner: None }
    }

    pub(crate) fn extend_one(&mut self, error: Report<C>) {
        match &mut self.inner {
            Some(inner) => inner.extend_one(error),
            inner => *inner = Some(error),
        }
    }

    pub(crate) fn into_result(self) -> Result<(), Report<C>> {
        self.inner.map_or_else(|| Ok(()), Err)
    }

    pub(crate) fn extend_existing(self, mut error: Report<C>) -> Report<C> {
        if let Some(inner) = self.inner {
            error.extend_one(inner);
        }

        error
    }
}
