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
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("invalid ANSI color, expected:")?;

        for (index, color) in Ansi::ALL.into_iter().enumerate() {
            if index != 0 {
                fmt.write_str(", or")?;
            }

            write!(fmt, " `{color}`")?;
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
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.0 {
            AnsiColor::Black => fmt.write_str("black"),
            AnsiColor::Red => fmt.write_str("red"),
            AnsiColor::Green => fmt.write_str("green"),
            AnsiColor::Yellow => fmt.write_str("yellow"),
            AnsiColor::Blue => fmt.write_str("blue"),
            AnsiColor::Magenta => fmt.write_str("magenta"),
            AnsiColor::Cyan => fmt.write_str("cyan"),
            AnsiColor::White => fmt.write_str("white"),
            AnsiColor::BrightBlack => fmt.write_str("bright-black"),
            AnsiColor::BrightRed => fmt.write_str("bright-red"),
            AnsiColor::BrightGreen => fmt.write_str("bright-green"),
            AnsiColor::BrightYellow => fmt.write_str("bright-yellow"),
            AnsiColor::BrightBlue => fmt.write_str("bright-blue"),
            AnsiColor::BrightMagenta => fmt.write_str("bright-magenta"),
            AnsiColor::BrightCyan => fmt.write_str("bright-cyan"),
            AnsiColor::BrightWhite => fmt.write_str("bright-white"),
        }
    }
}

impl FromStr for Ansi {
    type Err = AnsiParseError;

    fn from_str(ansi: &str) -> Result<Self, Self::Err> {
        let color = if ansi.eq_ignore_ascii_case("black") {
            AnsiColor::Black
        } else if ansi.eq_ignore_ascii_case("red") {
            AnsiColor::Red
        } else if ansi.eq_ignore_ascii_case("green") {
            AnsiColor::Green
        } else if ansi.eq_ignore_ascii_case("yellow") {
            AnsiColor::Yellow
        } else if ansi.eq_ignore_ascii_case("blue") {
            AnsiColor::Blue
        } else if ansi.eq_ignore_ascii_case("magenta") {
            AnsiColor::Magenta
        } else if ansi.eq_ignore_ascii_case("cyan") {
            AnsiColor::Cyan
        } else if ansi.eq_ignore_ascii_case("white") {
            AnsiColor::White
        } else if ansi.eq_ignore_ascii_case("bright-black") {
            AnsiColor::BrightBlack
        } else if ansi.eq_ignore_ascii_case("bright-red") {
            AnsiColor::BrightRed
        } else if ansi.eq_ignore_ascii_case("bright-green") {
            AnsiColor::BrightGreen
        } else if ansi.eq_ignore_ascii_case("bright-yellow") {
            AnsiColor::BrightYellow
        } else if ansi.eq_ignore_ascii_case("bright-blue") {
            AnsiColor::BrightBlue
        } else if ansi.eq_ignore_ascii_case("bright-magenta") {
            AnsiColor::BrightMagenta
        } else if ansi.eq_ignore_ascii_case("bright-cyan") {
            AnsiColor::BrightCyan
        } else if ansi.eq_ignore_ascii_case("bright-white") {
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
            anstyle::Color::Rgb(anstyle::RgbColor(red, green, blue)) => {
                let mut seq = serializer.serialize_seq(Some(3))?;
                seq.serialize_element(red)?;
                seq.serialize_element(green)?;
                seq.serialize_element(blue)?;
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

    fn visit_u8<E>(self, value: u8) -> Result<anstyle::Color, E> {
        Ok(anstyle::Color::Ansi256(Ansi256Color(value)))
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<anstyle::Color, A::Error>
    where
        A: serde::de::SeqAccess<'de>,
    {
        let red = seq
            .next_element()?
            .ok_or_else(|| serde::de::Error::invalid_length(0, &"3"))?;
        let green = seq
            .next_element()?
            .ok_or_else(|| serde::de::Error::invalid_length(1, &"3"))?;
        let blue = seq
            .next_element()?
            .ok_or_else(|| serde::de::Error::invalid_length(2, &"3"))?;

        Ok(anstyle::Color::Rgb(anstyle::RgbColor(red, green, blue)))
    }

    fn visit_str<E>(self, string: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ansi::deserialize(StrDeserializer::new(string))
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
