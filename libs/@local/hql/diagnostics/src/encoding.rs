use serde::{de::Visitor, ser::SerializeSeq};
use serde_with::{DeserializeAs, SerializeAs};

pub(crate) struct Color;

impl SerializeAs<ariadne::Color> for Color {
    fn serialize_as<S>(source: &ariadne::Color, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match source {
            ariadne::Color::Fixed(value) => serializer.serialize_u8(*value),
            ariadne::Color::Rgb(r, g, b) => {
                let mut seq = serializer.serialize_seq(Some(3))?;
                seq.serialize_element(r)?;
                seq.serialize_element(g)?;
                seq.serialize_element(b)?;
                seq.end()
            }
            ariadne::Color::Primary => serializer.serialize_str("primary"),
            ariadne::Color::Black => serializer.serialize_str("black"),
            ariadne::Color::Red => serializer.serialize_str("red"),
            ariadne::Color::Green => serializer.serialize_str("green"),
            ariadne::Color::Yellow => serializer.serialize_str("yellow"),
            ariadne::Color::Blue => serializer.serialize_str("blue"),
            ariadne::Color::Magenta => serializer.serialize_str("magenta"),
            ariadne::Color::Cyan => serializer.serialize_str("cyan"),
            ariadne::Color::White => serializer.serialize_str("white"),
            ariadne::Color::BrightBlack => serializer.serialize_str("bright-black"),
            ariadne::Color::BrightRed => serializer.serialize_str("bright-red"),
            ariadne::Color::BrightGreen => serializer.serialize_str("bright-green"),
            ariadne::Color::BrightYellow => serializer.serialize_str("bright-yellow"),
            ariadne::Color::BrightBlue => serializer.serialize_str("bright-blue"),
            ariadne::Color::BrightMagenta => serializer.serialize_str("bright-magenta"),
            ariadne::Color::BrightCyan => serializer.serialize_str("bright-cyan"),
            ariadne::Color::BrightWhite => serializer.serialize_str("bright-white"),
        }
    }
}

struct ColorVisitor;

impl<'de> Visitor<'de> for ColorVisitor {
    type Value = ariadne::Color;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("a color")
    }

    fn visit_u8<E>(self, value: u8) -> Result<ariadne::Color, E> {
        Ok(ariadne::Color::Fixed(value))
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<ariadne::Color, A::Error>
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

        Ok(ariadne::Color::Rgb(r, g, b))
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        match v {
            "primary" => Ok(ariadne::Color::Primary),
            "black" => Ok(ariadne::Color::Black),
            "red" => Ok(ariadne::Color::Red),
            "green" => Ok(ariadne::Color::Green),
            "yellow" => Ok(ariadne::Color::Yellow),
            "blue" => Ok(ariadne::Color::Blue),
            "magenta" => Ok(ariadne::Color::Magenta),
            "cyan" => Ok(ariadne::Color::Cyan),
            "white" => Ok(ariadne::Color::White),
            "bright-black" => Ok(ariadne::Color::BrightBlack),
            "bright-red" => Ok(ariadne::Color::BrightRed),
            "bright-green" => Ok(ariadne::Color::BrightGreen),
            "bright-yellow" => Ok(ariadne::Color::BrightYellow),
            "bright-blue" => Ok(ariadne::Color::BrightBlue),
            "bright-magenta" => Ok(ariadne::Color::BrightMagenta),
            "bright-cyan" => Ok(ariadne::Color::BrightCyan),
            "bright-white" => Ok(ariadne::Color::BrightWhite),
            _ => Err(serde::de::Error::unknown_variant(
                v,
                &[
                    "primary",
                    "black",
                    "red",
                    "green",
                    "yellow",
                    "blue",
                    "magenta",
                    "cyan",
                    "white",
                    "bright-black",
                    "bright-red",
                    "bright-green",
                    "bright-yellow",
                    "bright-blue",
                    "bright-magenta",
                    "bright-cyan",
                    "bright-white",
                ],
            )),
        }
    }
}

impl<'de> DeserializeAs<'de, ariadne::Color> for Color {
    fn deserialize_as<D>(deserializer: D) -> Result<ariadne::Color, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_any(ColorVisitor)
    }
}
