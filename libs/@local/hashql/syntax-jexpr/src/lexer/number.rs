//! JSON number parsing.
//!
//! The lexer preserves each number's spelling, including its sign and trailing zeros.
//!
//! The parser accepts:
//! - Integers: `42`, `-17`, `0`
//! - Decimals: `3.14`, `-0.5`
//! - Exponential notation: `1e10`, `1.5e-3`, `2E+8`
//!
//! The parser rejects:
//! - Leading zeros: `007`
//! - Leading plus sign: `+42`
//! - Trailing decimal point: `42.`
//! - Leading decimal point: `.5`

use core::fmt;

use text_size::{TextRange, TextSize};

/// The kind of error encountered while parsing a JSON number.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum ParseNumberErrorKind {
    /// Input ended unexpectedly while parsing a number.
    UnexpectedEof,
    /// Expected a digit but found something else (e.g., `42.` with no digits after the dot).
    ExpectedDigit,
    /// Found an unexpected digit, typically a leading zero followed by more digits (e.g., `007`).
    UnexpectedDigit(u8),
    /// Found an unexpected dot.
    UnexpectedDot,
    /// Found an unexpected exponent.
    UnexpectedExponent,
}

impl fmt::Display for ParseNumberErrorKind {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::UnexpectedEof => fmt.write_str("unexpected end of input"),
            Self::ExpectedDigit => fmt.write_str("expected digit"),
            Self::UnexpectedDigit(digit) => write!(fmt, "unexpected digit '{}'", *digit as char),
            Self::UnexpectedDot => fmt.write_str("unexpected dot"),
            Self::UnexpectedExponent => fmt.write_str("unexpected exponent"),
        }
    }
}

const fn skip_digits(mut rest: &[u8]) -> &[u8] {
    while let [b'0'..=b'9', tail @ ..] = rest {
        rest = tail;
    }

    rest
}

/// An error that occurred while parsing a JSON number.
///
/// Contains both the [`ParseNumberErrorKind`] describing what went wrong and a [`TextRange`]
/// indicating where in the input the error occurred.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ParseNumberError {
    /// The kind of parsing error.
    pub kind: ParseNumberErrorKind,
    /// The location in the input where the error occurred.
    pub range: TextRange,
}

/// A JSON number in its original spelling, without conversion to a machine number.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Number<'source> {
    Integer(&'source str),
    /// A number with a fraction, an exponent, or both.
    Float(&'source str),
}

impl<'source> Number<'source> {
    pub(crate) const fn as_str(self) -> &'source str {
        match self {
            Self::Integer(value) | Self::Float(value) => value,
        }
    }

    /// Borrows one JSON number from the start of `source`.
    ///
    /// # Errors
    ///
    /// Reports the byte offset of a missing digit or an invalid continuation, such as the second
    /// dot in `1.2.3`.
    #[inline]
    pub(crate) fn parse(source: &'source [u8]) -> Result<Self, ParseNumberError> {
        let error_at = |kind, rest: &[u8]| ParseNumberError {
            kind,
            range: TextRange::empty(
                TextSize::try_from(source.len() - rest.len())
                    .expect("source length fits in TextSize"),
            ),
        };

        let digits = |rest: &'source [u8]| match rest {
            [b'0'..=b'9', tail @ ..] => Ok(skip_digits(tail)),
            _ => Err(error_at(ParseNumberErrorKind::ExpectedDigit, rest)),
        };

        if source.is_empty() {
            return Err(error_at(ParseNumberErrorKind::UnexpectedEof, source));
        }

        let unsigned = source.strip_prefix(b"-").unwrap_or(source);
        let after_integer = match unsigned {
            [b'0', tail @ ..] => tail,
            _ => digits(unsigned)?,
        };

        let mut rest = after_integer;
        if let [b'.', tail @ ..] = rest {
            rest = digits(tail)?;
        }

        if let [b'e' | b'E', tail @ ..] = rest {
            let unsigned_exponent = match tail {
                [b'+' | b'-', digits @ ..] => digits,
                _ => tail,
            };

            rest = digits(unsigned_exponent)?;
        }

        match rest {
            [digit @ b'0'..=b'9', ..] => {
                return Err(error_at(
                    ParseNumberErrorKind::UnexpectedDigit(*digit),
                    rest,
                ));
            }
            [b'.', ..] => return Err(error_at(ParseNumberErrorKind::UnexpectedDot, rest)),
            [b'e' | b'E', ..] => {
                return Err(error_at(ParseNumberErrorKind::UnexpectedExponent, rest));
            }
            _ => {}
        }

        let matched = &source[..source.len() - rest.len()];

        #[expect(
            unsafe_code,
            reason = "the scanner already validated the matched bytes"
        )]
        // SAFETY: Only ASCII digits, signs, decimal points, and exponent markers were consumed.
        let value = unsafe { str::from_utf8_unchecked(matched) };
        if rest.len() == after_integer.len() {
            Ok(Self::Integer(value))
        } else {
            Ok(Self::Float(value))
        }
    }
}

impl fmt::Display for Number<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use proptest::{prop_assert_eq, property_test};
    use rstest::rstest;
    use serde_json::value::RawValue;
    use text_size::{TextRange, TextSize};

    use super::{Number, ParseNumberErrorKind};

    #[property_test]
    fn parse_generated_prefix(
        #[strategy = r"-?(0|[1-9][0-9]{0,64})(\.[0-9]{1,32})?([eE][+-]?[0-9]{1,12})?"]
        spelling: String,
    ) {
        let expected = if spelling.contains(['.', 'e', 'E']) {
            Number::Float(&spelling)
        } else {
            Number::Integer(&spelling)
        };
        let source = format!("{spelling},null]");
        prop_assert_eq!(Number::parse(source.as_bytes()), Ok(expected));
    }

    #[property_test]
    fn parse_number_syntax(#[strategy = r"[0-9.eE+\-]{0,48}"] candidate: String) {
        let expected = serde_json::from_str::<&RawValue>(&candidate)
            .ok()
            .map(RawValue::get);
        let actual = Number::parse(candidate.as_bytes()).ok().map(Number::as_str);
        prop_assert_eq!(
            actual.filter(|text| text.len() == candidate.len()),
            expected
        );
    }

    #[rstest]
    #[case::zero(Number::Integer("0"))]
    #[case::negative_zero(Number::Integer("-0"))]
    #[case::integer(Number::Integer("42"))]
    #[case::negative_integer(Number::Integer("-42"))]
    #[case::large_integer(Number::Integer("90071992547409931234567890"))]
    #[case::decimal(Number::Float("3.14"))]
    #[case::negative_decimal(Number::Float("-3.14"))]
    #[case::zero_decimal(Number::Float("0.5"))]
    #[case::exponent_lowercase(Number::Float("1e10"))]
    #[case::exponent_uppercase(Number::Float("1E10"))]
    #[case::exponent_positive(Number::Float("1e+10"))]
    #[case::exponent_negative(Number::Float("1e-10"))]
    #[case::decimal_with_exponent(Number::Float("1.00E+02"))]
    #[case::negative_decimal_with_exponent(Number::Float("-1.5e-10"))]
    #[case::max_precision(Number::Float("1.7976931348623157e308"))]
    #[case::min_precision(Number::Float("5e-324"))]
    fn parse_spelling(#[case] expected: Number<'_>) {
        let actual = Number::parse(expected.as_str().as_bytes()).expect("should parse the number");
        assert_eq!(actual, expected);
    }

    #[rstest]
    #[case(b"42abc", Number::Integer("42"))]
    #[case(b"-0}", Number::Integer("-0"))]
    #[case(b"1.00E+02 ", Number::Float("1.00E+02"))]
    #[case(b"1.5\xff", Number::Float("1.5"))]
    fn parse_prefix(#[case] input: &[u8], #[case] expected: Number<'_>) {
        assert_eq!(Number::parse(input), Ok(expected));
    }

    #[rstest]
    #[case::empty_input(b"", ParseNumberErrorKind::UnexpectedEof, 0)]
    #[case::leading_dot(b".5", ParseNumberErrorKind::ExpectedDigit, 0)]
    #[case::plus_sign(b"+42", ParseNumberErrorKind::ExpectedDigit, 0)]
    #[case::double_minus(b"--42", ParseNumberErrorKind::ExpectedDigit, 1)]
    #[case::minus_only(b"-", ParseNumberErrorKind::ExpectedDigit, 1)]
    #[case::invalid_exponent(b"1e", ParseNumberErrorKind::ExpectedDigit, 2)]
    #[case::invalid_exponent_with_sign(b"1e+", ParseNumberErrorKind::ExpectedDigit, 3)]
    #[case::trailing_dot(b"42.", ParseNumberErrorKind::ExpectedDigit, 3)]
    #[case::multiple_dots(b"1.2.3", ParseNumberErrorKind::UnexpectedDot, 3)]
    #[case::multiple_exponent(b"1e2e3", ParseNumberErrorKind::UnexpectedExponent, 3)]
    fn parse_invalid_numbers(
        #[case] input: &[u8],
        #[case] expected_kind: ParseNumberErrorKind,
        #[case] expected_pos: u32,
    ) {
        let error = Number::parse(input).expect_err("expected parse error");

        assert_eq!(error.kind, expected_kind);
        assert_eq!(error.range, TextRange::empty(TextSize::new(expected_pos)));
    }

    #[rstest]
    #[case::leading_zeros(b"007", b'0')]
    #[case::leading_zero_before_digit(b"042", b'4')]
    fn parse_leading_zero_errors(#[case] input: &[u8], #[case] unexpected_digit: u8) {
        let error = Number::parse(input).expect_err("expected parse error");

        assert_eq!(
            error.kind,
            ParseNumberErrorKind::UnexpectedDigit(unexpected_digit)
        );
        assert_eq!(error.range, TextRange::empty(TextSize::new(1)));
    }
}
