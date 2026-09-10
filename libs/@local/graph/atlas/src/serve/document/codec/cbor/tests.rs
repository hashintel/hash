use core::{
    cell::Cell,
    fmt::{self, Display},
};

use super::CborWriter;

#[track_caller]
fn assert_encoded(actual: &[u8], expected: &[u8]) {
    assert_eq!(actual, expected, "should encode to the expected CBOR bytes");
}

#[track_caller]
fn assert_case(actual: &[u8], expected: &[u8], case: impl Display) {
    assert_eq!(
        actual, expected,
        "{case} should encode to the expected CBOR bytes"
    );
}

struct CountedDisplay<'calls> {
    calls: &'calls Cell<u32>,
}

impl Display for CountedDisplay<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.calls.set(self.calls.get() + 1);
        fmt.write_str("counted")
    }
}

struct ChunkedText;

impl Display for ChunkedText {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("\u{65e5}")?;
        fmt.write_str("\u{672c}")?;
        fmt.write_str("\u{8a9e}")
    }
}

struct FailingDisplay;

impl Display for FailingDisplay {
    fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result {
        Err(fmt::Error)
    }
}

#[test]
fn uint_head_boundaries() {
    let cases: &[(u64, &[u8])] = &[
        (0, &[0x00]),
        (23, &[0x17]),
        (24, &[0x18, 0x18]),
        (255, &[0x18, 0xFF]),
        (256, &[0x19, 0x01, 0x00]),
        (0xFFFF, &[0x19, 0xFF, 0xFF]),
        (0x0001_0000, &[0x1A, 0x00, 0x01, 0x00, 0x00]),
        (0xFFFF_FFFF, &[0x1A, 0xFF, 0xFF, 0xFF, 0xFF]),
        (
            0x0001_0000_0000,
            &[0x1B, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00],
        ),
    ];
    for &(value, expected) in cases {
        let mut buffer = Vec::new();
        CborWriter::over(&mut buffer).uint(value);
        assert_case(&buffer, expected, format_args!("uint({value})"));
    }
}

#[test]
fn uint_max() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).uint(u64::MAX);
    assert_encoded(
        &buffer,
        &[0x1B, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    );
}

#[test]
fn int_positive_dispatch() {
    let cases: &[(i64, &[u8])] = &[(0, &[0x00]), (24, &[0x18, 0x18])];
    for &(value, expected) in cases {
        let mut buffer = Vec::new();
        CborWriter::over(&mut buffer).int(value);
        assert_case(&buffer, expected, format_args!("int({value})"));
    }
}

#[test]
fn int_negative_boundaries() {
    // Negative CBOR integers encode the argument −1 − value.
    let cases: &[(i64, &[u8])] = &[
        (-1, &[0x20]),
        (-24, &[0x37]),
        (-25, &[0x38, 0x18]),
        (-256, &[0x38, 0xFF]),
        (-257, &[0x39, 0x01, 0x00]),
        (-0x0001_0000, &[0x39, 0xFF, 0xFF]),
        (-0x0001_0001, &[0x3A, 0x00, 0x01, 0x00, 0x00]),
        (-0x0001_0000_0000, &[0x3A, 0xFF, 0xFF, 0xFF, 0xFF]),
        (
            -0x0001_0000_0001,
            &[0x3B, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00],
        ),
    ];
    for &(value, expected) in cases {
        let mut buffer = Vec::new();
        CborWriter::over(&mut buffer).int(value);
        assert_case(&buffer, expected, format_args!("int({value})"));
    }
}

#[test]
fn int_min() {
    // The CBOR argument −1 − i64::MIN equals i64::MAX.
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).int(i64::MIN);
    assert_encoded(
        &buffer,
        &[0x3B, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    );
}

#[test]
fn int_max() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).int(i64::MAX);
    assert_encoded(
        &buffer,
        &[0x1B, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    );
}

#[test]
fn boolean_true() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).boolean(true);
    assert_encoded(&buffer, &[0xF5]);
}

#[test]
fn boolean_false() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).boolean(false);
    assert_encoded(&buffer, &[0xF4]);
}

#[test]
fn null_value() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).null();
    assert_encoded(&buffer, &[0xF6]);
}

#[test]
fn f32_exact_small() {
    // 1.0 also has an exact half-precision form.
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).f32(1.0);
    assert_encoded(&buffer, &[0xFA, 0x3F, 0x80, 0x00, 0x00]);
}

#[test]
fn f32_signed_zero() {
    let mut positive = Vec::new();
    let mut negative = Vec::new();
    CborWriter::over(&mut positive).f32(0.0);
    CborWriter::over(&mut negative).f32(-0.0);

    assert_encoded(&positive, &[0xFA, 0x00, 0x00, 0x00, 0x00]);
    assert_encoded(&negative, &[0xFA, 0x80, 0x00, 0x00, 0x00]);
}

#[test]
fn f64_exact_small() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).f64(1.0);
    assert_encoded(
        &buffer,
        &[0xFB, 0x3F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    );
}

#[test]
fn f64_signed_zero() {
    let mut positive = Vec::new();
    let mut negative = Vec::new();
    CborWriter::over(&mut positive).f64(0.0);
    CborWriter::over(&mut negative).f64(-0.0);

    assert_encoded(
        &positive,
        &[0xFB, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    );
    assert_encoded(
        &negative,
        &[0xFB, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    );
}

#[test]
fn bytes_empty() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).bytes(&[]);
    assert_encoded(&buffer, &[0x40]);
}

#[test]
fn bytes_nonempty() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).bytes(&[0x01, 0x02, 0x03]);
    assert_encoded(&buffer, &[0x43, 0x01, 0x02, 0x03]);
}

#[test]
fn text_ascii() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).text("hi");
    assert_encoded(&buffer, &[0x62, b'h', b'i']);
}

#[test]
fn text_utf8_byte_lengths() {
    // The head counts encoded UTF-8 bytes, not characters.
    let cases: &[(&str, &[u8])] = &[
        ("\u{e9}", &[0x62, 0xC3, 0xA9]),
        ("\u{65e5}", &[0x63, 0xE6, 0x97, 0xA5]),
        ("a\u{20ac}b", &[0x65, b'a', 0xE2, 0x82, 0xAC, b'b']),
    ];
    for &(value, expected) in cases {
        let mut buffer = Vec::new();
        CborWriter::over(&mut buffer).text(value);
        assert_case(&buffer, expected, format_args!("text({value:?})"));
    }
}

#[test]
fn array_header() {
    let cases: &[(u64, &[u8])] = &[(0, &[0x80]), (3, &[0x83]), (24, &[0x98, 0x18])];
    for &(length, expected) in cases {
        let mut buffer = Vec::new();
        CborWriter::over(&mut buffer).array(length);
        assert_case(&buffer, expected, format_args!("array({length})"));
    }
}

#[test]
fn map_header() {
    let cases: &[(u64, &[u8])] = &[(0, &[0xA0]), (2, &[0xA2]), (24, &[0xB8, 0x18])];
    for &(length, expected) in cases {
        let mut buffer = Vec::new();
        CborWriter::over(&mut buffer).map(length);
        assert_case(&buffer, expected, format_args!("map({length})"));
    }
}

#[test]
fn sequential_writes() {
    let mut buffer = Vec::new();
    let mut writer = CborWriter::over(&mut buffer);
    writer.uint(1);
    writer.boolean(true);
    writer.text("ok");
    writer.null();

    assert_encoded(&buffer, &[0x01, 0xF5, 0x62, b'o', b'k', 0xF6]);
}

#[test]
fn collect_text_prefix() {
    let mut buffer = vec![0xDE, 0xAD, 0xBE, 0xEF];
    let mut writer = CborWriter::over(&mut buffer);
    writer.collect_text("hi");
    writer.uint(7);

    assert_encoded(&buffer, &[0xDE, 0xAD, 0xBE, 0xEF, 0x62, b'h', b'i', 0x07]);
}

#[test]
fn collect_text_ascii() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).collect_text("hi");
    assert_encoded(&buffer, &[0x62, b'h', b'i']);
}

#[test]
fn collect_text_empty() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).collect_text("");
    assert_encoded(&buffer, &[0x60]);
}

#[test]
fn collect_text_length_boundaries() {
    let cases: &[(usize, &[u8])] = &[
        (23, &[0x77]),
        (24, &[0x78, 0x18]),
        (255, &[0x78, 0xFF]),
        (256, &[0x79, 0x01, 0x00]),
        (0xFFFF, &[0x79, 0xFF, 0xFF]),
        (0x0001_0000, &[0x7A, 0x00, 0x01, 0x00, 0x00]),
    ];
    for &(len, head) in cases {
        let mut buffer = Vec::new();
        CborWriter::over(&mut buffer).collect_text("a".repeat(len));

        let mut expected = head.to_vec();
        expected.resize(head.len() + len, b'a');

        assert_case(&buffer, &expected, format_args!("collect_text(len={len})"));
    }
}

#[test]
fn collect_text_chunked_unicode() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).collect_text(ChunkedText);
    assert_encoded(
        &buffer,
        &[0x69, 0xE6, 0x97, 0xA5, 0xE6, 0x9C, 0xAC, 0xE8, 0xAA, 0x9E],
    );
}

#[test]
fn collect_text_format_once() {
    let calls = Cell::new(0_u32);
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).collect_text(CountedDisplay { calls: &calls });

    assert_eq!(
        calls.get(),
        1,
        "Display::fmt should run exactly once per collect_text call"
    );
    assert_encoded(&buffer, &[0x67, b'c', b'o', b'u', b'n', b't', b'e', b'd']);
}

#[test]
#[should_panic(expected = "formatting into a byte buffer should succeed")]
fn collect_text_fmt_error() {
    let mut buffer = Vec::new();
    CborWriter::over(&mut buffer).collect_text(FailingDisplay);
}
