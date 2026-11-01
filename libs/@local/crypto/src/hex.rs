use core::error::Error;

use error_stack::Report;
use zeroize::Zeroize as _;

/// An error from decoding hexadecimal input into a secret.
#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
pub enum HexError {
    /// The input is not `expected` bytes long.
    #[display("the hexadecimal input is not {expected} bytes long")]
    Length {
        /// The length in bytes the input should have, two for each byte of the secret.
        expected: usize,
    },
    /// The input has an odd length.
    #[display("the hexadecimal input has an odd length")]
    OddLength,
    /// The input contains a character that is not a hexadecimal digit.
    #[display("the hexadecimal input contains a character that is not a hexadecimal digit")]
    Digit,
}

impl Error for HexError {}

/// The number of bytes the hexadecimal `src` encodes.
///
/// On failure `src` is zeroed.
pub(crate) fn decoded_len(src: &mut str) -> Result<usize, Report<HexError>> {
    base16ct::decoded_len(src.as_bytes()).map_err(|error| {
        // Zeroed before the report is built, which can capture a span trace and so run subscriber
        // code that may panic.
        src.zeroize();
        Report::new(error).change_context(HexError::OddLength)
    })
}

/// Decodes the hexadecimal `src` into `dst` and zeroes `src`.
///
/// On failure `dst` is zeroed as well.
pub(crate) fn decode_hex_into(dst: &mut [u8], src: &mut str) -> Result<(), Report<HexError>> {
    // `base16ct` fills only a prefix of a longer `dst`, so the length has to match exactly.
    let expected = dst
        .len()
        .checked_mul(2)
        .unwrap_or_else(|| unreachable!("a slice is at most `isize::MAX` bytes long"));
    let result = if src.len() == expected {
        base16ct::mixed::decode(src.as_bytes(), dst).map(|_| ())
    } else {
        Err(base16ct::Error::InvalidLength)
    };
    src.zeroize();

    result.map_err(|error| {
        // Zeroed before the report is built, which can capture a span trace and so run subscriber
        // code that may panic.
        dst.zeroize();
        let context = match error {
            base16ct::Error::InvalidEncoding => HexError::Digit,
            base16ct::Error::InvalidLength => HexError::Length { expected },
        };
        Report::new(error).change_context(context)
    })
}

#[cfg(test)]
mod tests {
    use alloc::string::String;

    use rstest::rstest;

    use super::{HexError, decode_hex_into, decoded_len};

    fn is_zeroed(text: &str) -> bool {
        text.bytes().all(|byte| byte == 0)
    }

    #[test]
    fn decode_hex_into_mixed_case() {
        let mut dst = [0; 11];
        let mut src = String::from("0123456789abcdefABCDEF");

        decode_hex_into(&mut dst, &mut src).expect("the hex should decode");

        assert_eq!(
            dst,
            [
                0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0xAB, 0xCD, 0xEF
            ],
            "the destination should hold the decoded bytes"
        );
        assert!(is_zeroed(&src), "the source should be zeroed");
    }

    #[rstest]
    #[case::odd_length("abc", HexError::Length { expected: 4 })]
    #[case::too_short("ab", HexError::Length { expected: 4 })]
    #[case::too_long("abcdef", HexError::Length { expected: 4 })]
    #[case::trailing_newline("abcd\n", HexError::Length { expected: 4 })]
    #[case::multibyte("ab\u{20ac}d", HexError::Length { expected: 4 })]
    #[case::non_digit("G0g0", HexError::Digit)]
    fn decode_hex_into_invalid(#[case] src: &str, #[case] expected: HexError) {
        let mut dst = [0xAA; 2];
        let mut src = String::from(src);

        let report = decode_hex_into(&mut dst, &mut src).expect_err("the hex should not decode");

        assert_eq!(
            report.current_context(),
            &expected,
            "the error should name what is wrong"
        );
        assert_eq!(dst, [0; 2], "the destination should be zeroed");
        assert!(is_zeroed(&src), "the source should be zeroed");
    }

    #[rstest]
    #[case::empty("", 0)]
    #[case::even("0aB1", 2)]
    fn decoded_len_valid(#[case] src: &str, #[case] expected: usize) {
        let mut text = String::from(src);

        let len = decoded_len(&mut text).expect("the length should be known");

        assert_eq!(
            len, expected,
            "the length should be one byte per two digits"
        );
        assert_eq!(text, src, "the source should be kept for decoding");
    }

    #[rstest]
    #[case::odd_length("abc", HexError::OddLength)]
    #[case::trailing_newline("ab\n", HexError::OddLength)]
    fn decoded_len_invalid(#[case] src: &str, #[case] expected: HexError) {
        let mut src = String::from(src);

        let report = decoded_len(&mut src).expect_err("the length should not be known");

        assert_eq!(
            report.current_context(),
            &expected,
            "the error should name what is wrong"
        );
        assert!(is_zeroed(&src), "the source should be zeroed");
    }
}
