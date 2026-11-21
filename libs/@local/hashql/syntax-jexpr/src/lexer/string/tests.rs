use alloc::borrow::Cow;
use core::assert_matches;
use std::io::Write as _;

use proptest::{prop_assert_eq, property_test, sample::SizeRange};

use super::{DecodeSink, EscapeError, LexedStr, StringError, decode_quoted, scan};

fn decode<'source>(source: &mut &'source [u8]) -> Result<Cow<'source, str>, StringError> {
    scan(&mut DecodeSink::new(), source)
}

#[test]
fn vector_boundaries() {
    for offset in 0..=64 {
        let prefix = "x".repeat(offset);
        let plain = format!("{prefix}\u{1f980}\"tail");
        let mut source = plain.as_bytes();
        let value = decode(&mut source).expect("valid UTF-8 crossing a lane");
        assert_matches!(value, Cow::Borrowed(_));
        assert_eq!(value, format!("{prefix}\u{1f980}"));
        assert_eq!(source, b"tail");

        let escaped = format!(r#"{prefix}\n{prefix}\uD800\uDC00"tail"#);
        let mut source = escaped.as_bytes();
        let value = decode(&mut source).expect("valid surrogate pair");
        assert_matches!(value, Cow::Owned(_));
        assert_eq!(value, format!("{prefix}\n{prefix}\u{10000}"));
        assert_eq!(source, b"tail");

        let mut raw = prefix.into_bytes();
        raw.extend_from_slice(b"\x00\"tail");
        let mut source = raw.as_slice();
        assert_eq!(decode(&mut source), Err(StringError::Control));
        assert_eq!(source, b"\"tail");
    }
}

#[test]
fn escape_spellings() {
    let mut source = br#"\"\\\/\b\f\n\r\t\u00aB\u0000"tail"#.as_slice();
    let value = decode(&mut source).expect("should decode single-character and Unicode escapes");
    assert_eq!(value, "\"\\/\x08\x0c\n\r\t\u{ab}\0");
    assert_eq!(source, b"tail");
}

#[test]
fn single_ascii_escape_borrows() {
    for code in 0_u8..=0x7F {
        let body = format!(r#"\u{code:04X}""#);
        let lexed = LexedStr::new(&body).expect("ASCII unicode escape validates");
        assert!(lexed.has_escapes);
        assert_eq!(lexed.consumed(), body.len());

        let expected = char::from(code);
        let decoded = lexed.decode();
        assert_matches!(decoded, Cow::Borrowed(_));
        assert_eq!(decoded.as_ref(), expected.encode_utf8(&mut [0; 4]));

        let quoted = format!("\"{body}");
        let quoted_decoded = decode_quoted(&quoted).expect("quoted ASCII escape decodes");
        assert_matches!(quoted_decoded, Cow::Borrowed(_));
        assert_eq!(quoted_decoded.as_ref(), decoded.as_ref());
    }
}

#[test]
fn lexed_str_decode_cases() {
    for (body, expected, borrowed) in [
        (r#"""#, "", true),
        (r#"hello""#, "hello", true),
        (r#"\n""#, "\n", true),
        (r#"\"""#, "\"", true),
        (r#"a\nb""#, "a\nb", false),
        (r#"a\"b""#, "a\"b", false),
        (r#"\n\n""#, "\n\n", false),
        (r#"\u00E9""#, "\u{00E9}", false),
    ] {
        let lexed = LexedStr::new(body).expect("valid string body");
        let decoded = lexed.decode();
        assert_eq!(matches!(decoded, Cow::Borrowed(_)), borrowed);
        assert_eq!(decoded.as_ref(), expected);
    }
}

#[test]
fn decode_quoted_rejects_trailing_bytes() {
    assert_eq!(decode_quoted(r#""a"b"#), Err(StringError::Eof));
    assert_eq!(decode_quoted(r#""a\nb"c"#), Err(StringError::Eof));
}

#[test]
fn escape_errors() {
    for (input, kind, remaining) in [
        (br"\".as_slice(), EscapeError::Eof, b"".as_slice()),
        (br"\u123", EscapeError::Eof, b""),
        (br"\uG1", EscapeError::HexDigit(b'G'), b"1"),
        (b"\\u12\xff4", EscapeError::HexDigit(0xFF), b"4"),
        (br"\u12z4", EscapeError::HexDigit(b'z'), b"4"),
        (br"\q!", EscapeError::Kind(b'q'), b"!"),
        (br"\uDC00!", EscapeError::Surrogate(0xDC00), b"!"),
        (br"\uD800\q", EscapeError::ExpectedLowSurrogate, br"\q"),
        (br"\uD800\u1234!", EscapeError::ExpectedLowSurrogate, b"!"),
    ] {
        let mut source = input;
        assert_eq!(decode(&mut source), Err(StringError::Escape(kind)));
        assert_eq!(source, remaining);
    }
}

#[test]
fn malformed_utf8_before_delimiter() {
    for prefix in [b"".as_slice(), br"\n"] {
        for offset in 0..=32 {
            let mut input = prefix.to_vec();
            input.extend(core::iter::repeat_n(b'a', offset));
            input.extend_from_slice(b"\xE2\x82\\q");
            let mut source = input.as_slice();
            let Err(StringError::Utf8(error)) = decode(&mut source) else {
                panic!("invalid UTF-8 precedes the invalid escape");
            };
            assert_eq!(error.valid_up_to(), offset);
            assert_eq!(source, br"\q");
        }
    }
}

#[property_test]
fn serde_encoded(
    #[strategy = proptest::collection::vec(proptest::char::any(), SizeRange::default())] chars: Vec<
        char,
    >,
) {
    let string = chars.into_iter().collect::<String>();

    let encoded =
        serde_json::to_string(&string).expect("serde json should be able to encode a string");

    let decoded_oracle = serde_json::from_str::<String>(&encoded)
        .expect("serde json should be able to decode a string it encoded");

    // decode removes the first quote
    let [b'"', bytes @ ..] = encoded.as_bytes() else {
        panic!("encoded string should start with a quote");
    };
    let mut bytes = bytes;

    let decoded_actual =
        decode(&mut bytes).expect("decode should be able to decode a string decoded by serde json");

    prop_assert_eq!(decoded_oracle, decoded_actual);
}

#[property_test]
fn decode_mixed_escapes(characters: Vec<(char, bool)>) {
    let mut expected = String::new();

    let mut body = Vec::new();
    for (character, unicode_escape) in characters {
        expected.push(character);
        if unicode_escape {
            for unit in character.encode_utf16(&mut [0; 2]) {
                write!(body, "\\u{unit:04X}").expect("should write to a byte vector");
            }
        } else {
            let quoted = serde_json::to_vec(&character).expect("should serialize a character");
            let [b'"', spelling @ .., b'"'] = quoted.as_slice() else {
                panic!("serialized character should be a JSON string");
            };
            body.extend_from_slice(spelling);
        }
    }
    body.extend_from_slice(b"\"tail");

    let mut source = body.as_slice();
    let decoded = decode(&mut source).expect("should decode a valid JSON string body");
    prop_assert_eq!(decoded, expected);
    prop_assert_eq!(source, b"tail");
}

#[property_test]
fn validate_matches_decode_on_mixed_escapes(characters: Vec<(char, bool)>) {
    let mut body = String::new();
    let mut had_escape = false;
    for (character, unicode_escape) in characters {
        if unicode_escape {
            had_escape = true;
            for unit in character.encode_utf16(&mut [0; 2]) {
                use core::fmt::Write as _;
                write!(body, "\\u{unit:04X}").expect("should format unicode escape");
            }
        } else {
            let quoted = serde_json::to_string(&character).expect("should serialize a character");
            let spelling = quoted
                .strip_prefix('"')
                .and_then(|rest| rest.strip_suffix('"'))
                .expect("serde_json wraps serialized characters in quotes");
            if spelling.contains('\\') {
                had_escape = true;
            }
            body.push_str(spelling);
        }
    }
    body.push_str("\"tail");

    let lexed = LexedStr::new(&body).expect("valid string body should validate");
    prop_assert_eq!(lexed.has_escapes, had_escape);
    prop_assert_eq!(body.get(lexed.consumed()..), Some("tail"));

    let quoted = format!(
        "\"{}",
        body.strip_suffix("tail").expect("body ends with test tail")
    );
    let mut decode_src = body.as_bytes();
    let expected = decode(&mut decode_src).expect("should decode valid string");
    prop_assert_eq!(lexed.decode(), expected.as_ref());
    let actual = decode_quoted(&quoted).expect("should decode quoted string");
    prop_assert_eq!(actual, expected);
}

#[test]
fn validate_utf8_escape_error_stays_on_char_boundary() {
    for input in [
        "\\\u{1f980}\"tail",
        "\\u12\u{1f980}4\"tail",
        "\u{0007}\u{1f980}\"tail",
    ] {
        let error = LexedStr::new(input).expect_err("input should report string error");
        assert!(
            input.is_char_boundary(error.span.start) && input.is_char_boundary(error.span.end),
            "error span {:?} must lie on UTF-8 boundaries in {input:?}",
            error.span
        );
        assert_eq!(input.get(error.consumed..), Some("tail"));
    }
}

#[test]
fn validate_error_spans_target_offending_slice() {
    let err = LexedStr::new(r#"hello\zworld""#).expect_err("unknown escape");
    assert_eq!(r#"hello\zworld""#.get(err.span), Some(r"\z"));

    let err = LexedStr::new(r#"hello\u12g4""#).expect_err("bad hex digit");
    assert_eq!(r#"hello\u12g4""#.get(err.span), Some("g"));

    let err = LexedStr::new(r#"\uDC00""#).expect_err("unpaired low surrogate");
    assert_eq!(r#"\uDC00""#.get(err.span), Some(r"\uDC00"));

    let err = LexedStr::new(r#"\uD800""#).expect_err("unpaired high surrogate");
    assert_eq!(r#"\uD800""#.get(err.span), Some(r"\uD800"));

    let err = LexedStr::new(r#"\uD800\u1234""#).expect_err("invalid low surrogate");
    assert_eq!(r#"\uD800\u1234""#.get(err.span), Some(r"\u1234"));

    let err = LexedStr::new("a\nb\"").expect_err("unescaped newline");
    assert_eq!("a\nb\"".get(err.span), Some("\n"));

    let err = LexedStr::new(r"\u12").expect_err("incomplete unicode escape at EOF");
    assert_eq!(r"\u12".get(err.span), Some(r"\u12"));
}
