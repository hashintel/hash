pub(crate) mod color_option {
    #![expect(clippy::ref_option, clippy::trivially_copy_pass_by_ref)]
    use anstyle::Color;
    use serde::{Deserialize as _, Deserializer, Serialize as _, Serializer};

    #[derive(serde::Serialize, serde::Deserialize)]
    #[serde(transparent)]
    struct Wrapped(#[serde(with = "super::color")] Color);

    pub(crate) fn serialize<S: Serializer>(
        value: &Option<Color>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        value.map(Wrapped).serialize(serializer)
    }

    pub(crate) fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<Color>, D::Error> {
        let wrapped = Option::<Wrapped>::deserialize(deserializer)?;

        Ok(wrapped.map(|wrapped| wrapped.0))
    }
}

pub(crate) mod color {
    #![expect(clippy::trivially_copy_pass_by_ref, clippy::indexing_slicing)]
    use core::fmt;

    use anstyle::{Color, RgbColor};
    use anstyle_lossy::{color_to_rgb, palette};
    use serde::{
        Deserializer, Serializer,
        de::{Unexpected, Visitor},
    };

    fn write_hex_digit(target: &mut u8, value: u8) {
        match value {
            0..=9 => *target = b'0' + value,
            10..=15 => *target = b'A' + (value - 10),
            _ => unreachable!(),
        }
    }

    fn write_hex_u8(buffer: &mut [u8], value: u8) {
        assert!(buffer.len() >= 2);

        write_hex_digit(&mut buffer[0], value >> 4);
        write_hex_digit(&mut buffer[1], value & 0xF);
    }

    pub(crate) fn serialize<S: Serializer>(
        value: &Color,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        let rbg = color_to_rgb(*value, palette::DEFAULT);

        let mut buffer = [0_u8; 7];
        buffer[0] = b'#';
        write_hex_u8(&mut buffer[1..3], rbg.r());
        write_hex_u8(&mut buffer[3..5], rbg.g());
        write_hex_u8(&mut buffer[5..7], rbg.b());

        // In theory we could "safely" use `unchecked` here, but unsafe code in an encoding /
        // decoding context is a bit silly and we should avoid it unless we have a very good
        // reason to do so.
        let value = core::str::from_utf8(&buffer).unwrap_or_else(|_err| unreachable!());

        serializer.serialize_str(value)
    }

    pub(crate) fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Color, D::Error> {
        struct ColorVisitor;

        #[expect(clippy::min_ident_chars)]
        impl Visitor<'_> for ColorVisitor {
            type Value = Color;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a hexadecimal color code")
            }

            #[expect(clippy::missing_asserts_for_indexing, reason = "false positive")]
            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                let bytes = v.as_bytes();

                if bytes.len() != 7 && bytes.len() != 4 {
                    return Err(E::invalid_length(v.len(), &"string of length 4 or 7"));
                }

                if bytes[0] != b'#' {
                    return Err(E::invalid_value(
                        Unexpected::Str(v),
                        &"string starting with '#'",
                    ));
                }

                let rgb = if v.len() == 4 {
                    // For 3-digit hex colors (#RGB), each digit is duplicated to get the 6-digit
                    // form (#RRGGBB) For example, #F00 becomes #FF0000
                    let r = u8::from_ascii_radix(&bytes[1..2], 16).map_err(E::custom)?;
                    let g = u8::from_ascii_radix(&bytes[2..3], 16).map_err(E::custom)?;
                    let b = u8::from_ascii_radix(&bytes[3..4], 16).map_err(E::custom)?;

                    // Duplicate each digit
                    RgbColor((r << 4) | r, (g << 4) | g, (b << 4) | b)
                } else {
                    let r = u8::from_ascii_radix(&bytes[1..3], 16).map_err(E::custom)?;
                    let g = u8::from_ascii_radix(&bytes[3..5], 16).map_err(E::custom)?;
                    let b = u8::from_ascii_radix(&bytes[5..7], 16).map_err(E::custom)?;

                    RgbColor(r, g, b)
                };

                Ok(Color::Rgb(rgb))
            }
        }

        deserializer.deserialize_str(ColorVisitor)
    }

    #[cfg(test)]
    mod tests {
        #![expect(clippy::non_ascii_literal)]
        use anstyle::{Ansi256Color, AnsiColor, Color, RgbColor};
        use rstest::rstest;
        use serde_json::{from_value, json, to_value};

        #[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
        struct Example {
            #[serde(with = "super")]
            color: Color,
        }

        #[rstest]
        #[case(Color::Rgb(RgbColor(255, 0, 0)), "#FF0000")]
        #[case(Color::Rgb(RgbColor(0, 255, 0)), "#00FF00")]
        #[case(Color::Rgb(RgbColor(0, 0, 255)), "#0000FF")]
        #[case(Color::Rgb(RgbColor(0, 0, 0)), "#000000")]
        #[case(Color::Rgb(RgbColor(255, 255, 255)), "#FFFFFF")]
        #[case(Color::Rgb(RgbColor(128, 0, 128)), "#800080")]
        #[case(Color::Ansi(AnsiColor::Red), "#AA0000")]
        #[case(Color::Ansi256(Ansi256Color(42)), "#00D787")]
        fn serialize(#[case] color: Color, #[case] expected: &str) {
            let value = Example { color };
            let encoded = to_value(value).expect("should be able to serialize color");
            assert_eq!(encoded, json!({"color": expected}));
        }

        #[rstest]
        #[case("#FF0000", Color::Rgb(RgbColor(255, 0, 0)))]
        #[case("#00FF00", Color::Rgb(RgbColor(0, 255, 0)))]
        #[case("#0000FF", Color::Rgb(RgbColor(0, 0, 255)))]
        #[case("#000000", Color::Rgb(RgbColor(0, 0, 0)))]
        #[case("#FFFFFF", Color::Rgb(RgbColor(255, 255, 255)))]
        #[case("#800080", Color::Rgb(RgbColor(128, 0, 128)))]
        #[case("#F00", Color::Rgb(RgbColor(255, 0, 0)))]
        #[case("#555", Color::Rgb(RgbColor(85, 85, 85)))]
        fn deserialize(#[case] input: &str, #[case] expected: Color) {
            let value = json!({"color": input});
            let decoded: Example = from_value(value).expect("should be able to deserialize color");
            assert_eq!(decoded.color, expected);
        }

        #[test]
        fn roundtrip() {
            let value = Example {
                color: Color::Rgb(RgbColor(128, 64, 32)),
            };

            let json = to_value(value).expect("should serialize color");
            let roundtrip: Example = from_value(json).expect("should deserialize color");

            assert_eq!(
                value, roundtrip,
                "Color should be preserved through serialization and deserialization"
            );
        }

        #[rstest]
        #[case("#FF", "invalid length 3, expected string of length 4 or 7")]
        #[case("#FFFFFFF", "invalid length 8, expected string of length 4 or 7")]
        #[case("FF0000", "invalid length 6, expected string of length 4 or 7")]
        #[case("^FF0000", "expected string starting with '#'")]
        #[case("#GGHHII", "invalid digit found in string")]
        #[case("#☢️🚀💥", "invalid length 15, expected string of length 4 or 7")]
        fn invalid_input(#[case] input: &str, #[case] message: &str) {
            let value = json!({"color": input});

            let error = from_value::<Example>(value).expect_err("should error on invalid color");
            let error = error.to_string();

            assert!(
                error.contains(message),
                r#""{error}" should contain "{message}", but didn't."#
            );
        }
    }
}
