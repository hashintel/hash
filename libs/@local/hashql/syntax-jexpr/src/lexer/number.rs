//! JSON number parsing.
//!
//! This module provides types for parsing and representing JSON numbers according to the JSON
//! specification (RFC 8259). Numbers are parsed using [`hifijson`] for conformance and performance,
//! while tracking structural information about the number's format.
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

use hifijson::{Read as _, num::Lex as _, token::Lex as _};
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
    /// Found an unexpected dot
    UnexpectedDot,
    /// Found an unexpected exponent
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

impl ParseNumberError {
    /// Creates an EOF error at position 0.
    const fn eof() -> Self {
        Self {
            kind: ParseNumberErrorKind::UnexpectedEof,
            range: TextRange::empty(TextSize::new(0)),
        }
    }
}

/// Structural information about a parsed JSON number.
///
/// Tracks the positions of the decimal point and exponent marker within the number, enabling
/// downstream code to determine the number's format without re-parsing.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(super) struct Parts {
    /// Position of the decimal point (`.`), if present.
    dot: Option<TextSize>,
    /// Position of the exponent marker (`e` or `E`), if present.
    exp: Option<TextSize>,
}

impl Parts {
    fn offset(self, offset: TextSize) -> Self {
        let dot = self.dot.map(|dot| dot + offset);
        let exp = self.exp.map(|exp| exp + offset);

        Self { dot, exp }
    }
}

impl From<hifijson::num::Parts> for Parts {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "4GiB limit enforced by lexer"
    )]
    fn from(hifijson::num::Parts { dot, exp }: hifijson::num::Parts) -> Self {
        Self {
            dot: dot.map(|dot| TextSize::new(dot.get() as u32)),
            exp: exp.map(|expr| TextSize::new(expr.get() as u32)),
        }
    }
}

/// A parsed JSON number.
///
/// Represents a valid JSON number that has been parsed from source input. The number retains a
/// reference to the original source bytes and tracks structural information about its format
/// (whether it contains a decimal point or exponent).
///
/// This type does not convert the number to a numeric type like [`f64`] or [`i64`]; it preserves
/// the original textual representation for lossless handling of arbitrary-precision numbers.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct Number<'source> {
    /// The raw bytes of the number from the source input.
    value: &'source [u8],
    /// Structural information about the number's format.
    parts: Parts,
}

impl<'source> Number<'source> {
    /// Creates a [`Number`] from pre-validated parts without validation.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `value` is valid UTF-8. In debug builds, this is verified with
    /// a debug assertion.
    #[expect(unsafe_code)]
    pub(super) const unsafe fn from_parts_unchecked(value: &'source [u8], parts: Parts) -> Self {
        debug_assert!(
            core::str::from_utf8(value).is_ok(),
            "Invalid UTF-8 Sequence"
        );

        Self { value, parts }
    }

    /// Returns `true` if the number contains a decimal point.
    ///
    /// This can be used to distinguish integers from floating-point numbers without parsing the
    /// value.
    pub(crate) const fn has_dot(&self) -> bool {
        self.parts.dot.is_some()
    }

    /// Returns `true` if the number contains an exponent (e.g., `1e10`).
    pub(crate) const fn has_exponent(&self) -> bool {
        self.parts.exp.is_some()
    }

    /// Returns the number as a string slice.
    #[expect(unsafe_code)]
    pub(crate) const fn as_str(&self) -> &'source str {
        // SAFETY: The value is verified to be valid UTF-8
        unsafe { core::str::from_utf8_unchecked(self.value) }
    }

    /// Parses a JSON number from the beginning of `value`.
    ///
    /// Returns a tuple of `(consumed, result)` where `consumed` is the number of bytes parsed
    /// and `result` is either the parsed [`Number`] or a [`ParseNumberError`].
    ///
    /// The parser handles optional leading minus sign, integer part, optional fractional part,
    /// and optional exponent. It stops at the first byte that cannot be part of a valid JSON
    /// number.
    ///
    /// # Errors
    ///
    /// - [`ParseNumberErrorKind::Eof`] if the input is empty
    /// - [`ParseNumberErrorKind::ExpectedDigit`] if a digit was expected but not found
    /// - [`ParseNumberErrorKind::UnexpectedDigit`] if an invalid digit sequence was found (e.g.,
    ///   leading zeros)
    pub(crate) fn parse(value: &'source [u8]) -> (u32, Result<Self, ParseNumberError>) {
        if value.is_empty() {
            return (0, Err(ParseNumberError::eof()));
        }

        let mut lexer = hifijson::SliceLexer::new(value);

        let mut is_negative = false;
        let mut consumed = 0;
        if value[0] == b'-' {
            is_negative = true;
            consumed += 1;
            lexer.discarded();
        }

        let result = lexer
            .num_foreach(|_| {
                consumed += 1;
            })
            .map_err(|error| ParseNumberError {
                kind: match error {
                    hifijson::num::Error::ExpectedDigit => ParseNumberErrorKind::ExpectedDigit,
                },
                range: TextRange::empty(TextSize::new(consumed)),
            })
            .and_then(|parts| {
                // hifijson does not eagerly consume and check the next token, so we must manually
                // verify it. The parser would reject the output in all cases anyway, but this
                // allows us to provide more helpful diagnostics.
                match lexer.peek_next() {
                    Some(digit @ b'0'..=b'9') => Err(ParseNumberError {
                        kind: ParseNumberErrorKind::UnexpectedDigit(digit),
                        range: TextRange::empty(TextSize::new(consumed)),
                    }),
                    Some(b'.') => Err(ParseNumberError {
                        kind: ParseNumberErrorKind::UnexpectedDot,
                        range: TextRange::empty(TextSize::new(consumed)),
                    }),
                    Some(b'e' | b'E') => Err(ParseNumberError {
                        kind: ParseNumberErrorKind::UnexpectedExponent,
                        range: TextRange::empty(TextSize::new(consumed)),
                    }),
                    _ => Ok(parts),
                }
            })
            .map(
                #[expect(unsafe_code)]
                |parts| {
                    // SAFETY: hifijson verified the value is valid UTF-8
                    unsafe {
                        Self::from_parts_unchecked(
                            &value[..(consumed as usize)],
                            Parts::from(parts).offset(TextSize::new(u32::from(is_negative))),
                        )
                    }
                },
            );

        (consumed, result)
    }
}

impl fmt::Display for Number<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use rstest::rstest;
    use text_size::{TextRange, TextSize};

    use super::{Number, ParseNumberErrorKind};

    /// Parses a number and asserts success.
    #[track_caller]
    fn parse_ok(input: &[u8]) -> (Number<'_>, u32) {
        let (consumed, result) = Number::parse(input);
        let number = result.expect("expected successful parse");
        (number, consumed)
    }

    #[rstest]
    #[case::zero(b"0", 1, None, None)]
    #[case::integer(b"42", 2, None, None)]
    #[case::negative_integer(b"-42", 3, None, None)]
    #[case::large_integer(b"9007199254740991", 16, None, None)]
    #[case::decimal(b"3.14", 4, Some(1), None)]
    #[case::negative_decimal(b"-3.14", 5, Some(2), None)]
    #[case::zero_decimal(b"0.5", 3, Some(1), None)]
    #[case::exponent_lowercase(b"1e10", 4, None, Some(1))]
    #[case::exponent_uppercase(b"1E10", 4, None, Some(1))]
    #[case::exponent_positive(b"1e+10", 5, None, Some(1))]
    #[case::exponent_negative(b"1e-10", 5, None, Some(1))]
    #[case::decimal_with_exponent(b"1.5e10", 6, Some(1), Some(3))]
    #[case::negative_decimal_with_exponent(b"-1.5e-10", 8, Some(2), Some(4))]
    #[case::max_precision(b"1.7976931348623157e308", 22, Some(1), Some(18))]
    #[case::min_precision(b"5e-324", 6, None, Some(1))]
    fn parse_valid_numbers(
        #[case] input: &[u8],
        #[case] expected_consumed: u32,
        #[case] expected_dot: Option<u32>,
        #[case] expected_exp: Option<u32>,
    ) {
        let (number, consumed) = parse_ok(input);

        assert_eq!(consumed, expected_consumed);
        assert_eq!(number.has_dot(), expected_dot.is_some());
        assert_eq!(number.has_exponent(), expected_exp.is_some());
        assert_eq!(number.parts.dot, expected_dot.map(TextSize::new));
        assert_eq!(number.parts.exp, expected_exp.map(TextSize::new));
    }

    #[rstest]
    #[case::trailing_content(b"42abc", 2)]
    #[case::json_context(b"42}", 2)]
    #[case::stops_at_space(b"42 ", 2)]
    fn parse_stops_at_non_number(#[case] input: &[u8], #[case] expected_consumed: u32) {
        let (_, consumed) = parse_ok(input);
        assert_eq!(consumed, expected_consumed);
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
        let (_, result) = Number::parse(input);
        let error = result.expect_err("expected parse error");

        assert_eq!(error.kind, expected_kind);
        assert_eq!(error.range, TextRange::empty(TextSize::new(expected_pos)));
    }

    #[rstest]
    #[case::leading_zeros(b"007", b'0')]
    #[case::leading_zero_before_digit(b"042", b'4')]
    fn parse_leading_zero_errors(#[case] input: &[u8], #[case] unexpected_digit: u8) {
        let (_, result) = Number::parse(input);
        let error = result.expect_err("expected parse error");

        assert_eq!(
            error.kind,
            ParseNumberErrorKind::UnexpectedDigit(unexpected_digit)
        );
    }
}
