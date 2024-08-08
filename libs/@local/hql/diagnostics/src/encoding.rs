use core::{
    fmt::{self, Display},
    str::FromStr,
};

use anstyle::{Ansi256Color, AnsiColor};
use serde::{
    de::{value::StrDeserializer, Visitor},
    ser::SerializeSeq,
    Deserialize, Serialize,
};
use serde_with::{DeserializeAs, SerializeAs};

struct AnsiParseError;

impl Display for AnsiParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("invalid ANSI color, expected:")?;

        for (index, color) in Ansi::ALL.into_iter().enumerate() {
            if index != 0 {
                f.write_str(", or")?;
            }

            write!(f, " `{color}`")?;
        }

        Ok(())
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde_with::SerializeDisplay,
    serde_with::DeserializeFromStr,
)]
struct Ansi(AnsiColor);

impl Ansi {
    const ALL: [Self; 16] = [
        Self(AnsiColor::Black),
        Self(AnsiColor::Red),
        Self(AnsiColor::Green),
        Self(AnsiColor::Yellow),
        Self(AnsiColor::Blue),
        Self(AnsiColor::Magenta),
        Self(AnsiColor::Cyan),
        Self(AnsiColor::White),
        Self(AnsiColor::BrightBlack),
        Self(AnsiColor::BrightRed),
        Self(AnsiColor::BrightGreen),
        Self(AnsiColor::BrightYellow),
        Self(AnsiColor::BrightBlue),
        Self(AnsiColor::BrightMagenta),
        Self(AnsiColor::BrightCyan),
        Self(AnsiColor::BrightWhite),
    ];
}

impl Display for Ansi {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.0 {
            AnsiColor::Black => f.write_str("black"),
            AnsiColor::Red => f.write_str("red"),
            AnsiColor::Green => f.write_str("green"),
            AnsiColor::Yellow => f.write_str("yellow"),
            AnsiColor::Blue => f.write_str("blue"),
            AnsiColor::Magenta => f.write_str("magenta"),
            AnsiColor::Cyan => f.write_str("cyan"),
            AnsiColor::White => f.write_str("white"),
            AnsiColor::BrightBlack => f.write_str("bright-black"),
            AnsiColor::BrightRed => f.write_str("bright-red"),
            AnsiColor::BrightGreen => f.write_str("bright-green"),
            AnsiColor::BrightYellow => f.write_str("bright-yellow"),
            AnsiColor::BrightBlue => f.write_str("bright-blue"),
            AnsiColor::BrightMagenta => f.write_str("bright-magenta"),
            AnsiColor::BrightCyan => f.write_str("bright-cyan"),
            AnsiColor::BrightWhite => f.write_str("bright-white"),
        }
    }
}

impl FromStr for Ansi {
    type Err = AnsiParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let color = if s.eq_ignore_ascii_case("black") {
            AnsiColor::Black
        } else if s.eq_ignore_ascii_case("red") {
            AnsiColor::Red
        } else if s.eq_ignore_ascii_case("green") {
            AnsiColor::Green
        } else if s.eq_ignore_ascii_case("yellow") {
            AnsiColor::Yellow
        } else if s.eq_ignore_ascii_case("blue") {
            AnsiColor::Blue
        } else if s.eq_ignore_ascii_case("magenta") {
            AnsiColor::Magenta
        } else if s.eq_ignore_ascii_case("cyan") {
            AnsiColor::Cyan
        } else if s.eq_ignore_ascii_case("white") {
            AnsiColor::White
        } else if s.eq_ignore_ascii_case("bright-black") {
            AnsiColor::BrightBlack
        } else if s.eq_ignore_ascii_case("bright-red") {
            AnsiColor::BrightRed
        } else if s.eq_ignore_ascii_case("bright-green") {
            AnsiColor::BrightGreen
        } else if s.eq_ignore_ascii_case("bright-yellow") {
            AnsiColor::BrightYellow
        } else if s.eq_ignore_ascii_case("bright-blue") {
            AnsiColor::BrightBlue
        } else if s.eq_ignore_ascii_case("bright-magenta") {
            AnsiColor::BrightMagenta
        } else if s.eq_ignore_ascii_case("bright-cyan") {
            AnsiColor::BrightCyan
        } else if s.eq_ignore_ascii_case("bright-white") {
            AnsiColor::BrightWhite
        } else {
            return Err(AnsiParseError);
        };

        Ok(Self(color))
    }
}

pub(crate) struct Color;

impl SerializeAs<anstyle::Color> for Color {
    fn serialize_as<S>(source: &anstyle::Color, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match source {
            anstyle::Color::Ansi(color) => Ansi(*color).serialize(serializer),
            anstyle::Color::Ansi256(color) => serializer.serialize_u8(color.0),
            anstyle::Color::Rgb(anstyle::RgbColor(r, g, b)) => {
                let mut seq = serializer.serialize_seq(Some(3))?;
                seq.serialize_element(r)?;
                seq.serialize_element(g)?;
                seq.serialize_element(b)?;
                seq.end()
            }
        }
    }
}

struct ColorVisitor;

impl<'de> Visitor<'de> for ColorVisitor {
    type Value = anstyle::Color;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a color")
    }

    fn visit_u8<E>(self, v: u8) -> Result<anstyle::Color, E> {
        Ok(anstyle::Color::Ansi256(Ansi256Color(v)))
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<anstyle::Color, A::Error>
    where
        A: serde::de::SeqAccess<'de>,
    {
        let r = seq
            .next_element()?
            .ok_or_else(|| serde::de::Error::invalid_length(0, &"3"))?;
        let g = seq
            .next_element()?
            .ok_or_else(|| serde::de::Error::invalid_length(1, &"3"))?;
        let b = seq
            .next_element()?
            .ok_or_else(|| serde::de::Error::invalid_length(2, &"3"))?;

        Ok(anstyle::Color::Rgb(anstyle::RgbColor(r, g, b)))
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ansi::deserialize(StrDeserializer::new(v))
            .map(|color| color.0)
            .map(anstyle::Color::Ansi)
    }
}

impl<'de> DeserializeAs<'de, anstyle::Color> for Color {
    fn deserialize_as<D>(deserializer: D) -> Result<anstyle::Color, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_any(ColorVisitor)
    }
}
