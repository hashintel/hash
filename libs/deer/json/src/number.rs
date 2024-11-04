#[cfg(not(feature = "arbitrary-precision"))]
use deer::error::Variant as _;
use deer::{Number, error::Error};
use error_stack::Report;
use justjson::JsonNumber;
#[cfg(not(feature = "arbitrary-precision"))]
use lexical::{
    FromLexicalWithOptions as _, parse_float_options::JSON, parse_integer_options::STANDARD,
};

#[cfg(not(feature = "arbitrary-precision"))]
use crate::error::NumberError;

#[cfg(not(feature = "arbitrary-precision"))]
pub(crate) fn try_convert_number(number: &JsonNumber) -> Result<Number, Report<Error>> {
    let number_source = number.source();
    let negative = number_source.as_bytes().first().copied() == Some(b'-');

    if memchr::memchr(b'.', number_source.as_bytes()).is_some() {
        // justjson ensures that the value itself is valid JSON, can only error out if there are too
        // many digits
        f64::from_lexical_with_options::<{ lexical::format::JSON }>(number_source.as_bytes(), &JSON)
            .map(Number::from)
            .map_err(
                // TODO: once stabilized use `Error` as base
                |_error| Report::new(NumberError::Unknown.into_error()),
            )
    } else if negative {
        i64::from_lexical_with_options::<{ lexical::format::JSON }>(
            number_source.as_bytes(),
            &STANDARD,
        )
        .map(Number::from)
        .map_err(|error| match error {
            lexical::Error::Underflow(_) => NumberError::Underflow,
            lexical::Error::Overflow(_) => NumberError::Overflow,
            _ => NumberError::Unknown,
        })
        .map_err(|error| Report::new(error.into_error()))
    } else {
        u64::from_lexical_with_options::<{ lexical::format::JSON }>(
            number_source.as_bytes(),
            &STANDARD,
        )
        .map(Number::from)
        .map_err(|error| match error {
            lexical::Error::Underflow(_) => NumberError::Underflow,
            lexical::Error::Overflow(_) => NumberError::Overflow,
            _ => NumberError::Unknown,
        })
        .map_err(|error| Report::new(error.into_error()))
    }
}

#[cfg(feature = "arbitrary-precision")]
#[expect(clippy::unnecessary_wraps)]
pub(crate) fn try_convert_number(number: &JsonNumber) -> Result<Number, Report<Error>> {
    #[expect(unsafe_code)]
    // SAFETY: `justjson` ensures that the contained source is a valid JSON number, these are
    // accepted by the parse algorithm of Rust
    Ok(unsafe { Number::from_string_unchecked(number.source()) })
}
