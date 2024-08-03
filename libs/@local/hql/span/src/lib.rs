extern crate alloc;

pub mod data;
pub mod file;
#[cfg(feature = "json")]
pub mod json;
pub mod storage;

use core::fmt;

pub use text_size::{TextRange, TextSize};

/// Represents a span of text within a source file.
///
/// This struct serves as a reference to a specific range of text within a source file.
/// The range is 8 bytes in size, allowing it to be stored in a single word and easily
/// passed around. Each `Span` instance is considered unique, even if spans overlap
/// exactly, as they refer to the same range of text data, therefore to the same data.
///
/// The reason why a `Span` is not just some opaque data, like a JSON Pointer, is that it may refer
/// to some invalid data, or to something relative in an item, something that one cannot easily
/// point to via a JSON Pointer, while not useful it is more seen suplementary, as an additional
/// JSON Pointer, just like any other metadata for other frontends.
///
/// ## Unique Identification
///
/// Each span is uniquely identified, making it safe to assume that spans are unique.
/// This avoids the possibility of associating multiple pieces of information with the
/// same span under the different ids.
///
/// Byte indices are unique in validated data (like a JSON string) and in malformed data as well.
/// While some spans might carry additional metadata, like JSON pointers, others might not.
///
/// ## Span Hierarchy
///
/// The span identifier is unique to both its start and end points, allowing for nested spans,
/// for example:
/// * Parent span: 7..17
/// * Child span: 9..11
///
/// ## Inspirations
///
/// This design is inspired by:
/// - [rust-analyzer](https://github.com/rust-lang/rust-analyzer/blob/aa00ddcf654a35ba0eafe17247cf189958d33182/crates/span/src/lib.rs)
/// - [rust](https://doc.rust-lang.org/stable/nightly-rustc/rustc_span/struct.Span.html)
///
/// ## Comparison
///
/// ### rust-analyzer
///
/// In rust-analyzer, a `Span` is typically represented as a `TextRange` which is 8 bytes in size.
/// During later stages like High Intermediate Representation (HIR) analysis, it is replaced with a
/// more complex `Span` struct which is at least 16 bytes large.
/// Unlike rust-analyzer, this implementation keeps spans as absolute values rather than relative to
/// a parent.
///
/// ### rustc
///
/// In rustc, a `Span` is split into a `Span` and `SpanData`. The `Span` is 8 bytes and stores more
/// complex information, while a `SpanData` struct provides additional context. The encoding varies
/// depending on the present values, making this approach complex but efficient by often avoiding
/// lookups.
// TODO: in the future one **might** want to associate a `Span` with a `FileId` to make it easier to
//      work with spans from different files, but for now it is not necessary, as any span on any
//      expression can be resolved to a file. The important reason as to why this is not done is
//      that it is redundant information and would bloat the span from 8 bytes to 12 bytes.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Span(TextRange);

impl Span {
    #[must_use]
    pub const fn new(start: TextSize, end: TextSize) -> Self {
        Self(TextRange::new(start, end))
    }

    #[must_use]
    pub const fn start(self) -> TextSize {
        self.0.start()
    }

    #[must_use]
    pub const fn end(self) -> TextSize {
        self.0.end()
    }

    #[must_use]
    pub const fn range(self) -> TextRange {
        self.0
    }
}

impl From<TextRange> for Span {
    fn from(range: TextRange) -> Self {
        Self(range)
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for Span {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;

        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("start", &u32::from(self.start()))?;
        map.serialize_entry("end", &u32::from(self.end()))?;
        map.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for Span {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::Visitor;

        struct SpanVisitor;

        impl<'de> Visitor<'de> for SpanVisitor {
            type Value = Span;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a span object with start and end fields")
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::MapAccess<'de>,
            {
                #[derive(serde::Deserialize)]
                #[serde(field_identifier, rename_all = "lowercase")]
                enum Field {
                    Start,
                    End,
                }

                let mut start = None;
                let mut end = None;

                while let Some(key) = map.next_key()? {
                    match key {
                        Field::Start => {
                            if start.is_some() {
                                return Err(serde::de::Error::duplicate_field("start"));
                            }
                            start = Some(map.next_value()?);
                        }
                        Field::End => {
                            if end.is_some() {
                                return Err(serde::de::Error::duplicate_field("end"));
                            }
                            end = Some(map.next_value()?);
                        }
                    }
                }

                let start: u32 = start.ok_or_else(|| serde::de::Error::missing_field("start"))?;
                let end: u32 = end.ok_or_else(|| serde::de::Error::missing_field("end"))?;

                Ok(Span::new(TextSize::from(start), TextSize::from(end)))
            }
        }

        deserializer.deserialize_map(SpanVisitor)
    }
}

#[cfg(test)]
mod test {
    #[cfg(feature = "serde")]
    #[test]
    fn serialize() {
        use text_size::TextSize;

        use crate::Span;

        let span = Span::new(TextSize::from(10), TextSize::from(20));
        let json = serde_json::to_string(&span).expect("valid json");
        assert_eq!(json, r#"{"start":10,"end":20}"#);
    }

    #[cfg(feature = "serde")]
    #[test]
    fn deserialize() {
        use text_size::TextSize;

        use crate::Span;

        let json = r#"{"start":10,"end":20}"#;
        let span: Span = serde_json::from_str(json).expect("valid json");
        assert_eq!(span, Span::new(TextSize::from(10), TextSize::from(20)));
    }

    #[cfg(feature = "serde")]
    #[test]
    fn deserialize_missing_key() {
        use crate::Span;

        let json = r#"{"start":10}"#;
        let error = serde_json::from_str::<'_, Span>(json).expect_err("missing end key");
        assert!(error.to_string().starts_with("missing field `end`"));

        let json = r#"{"end":20}"#;
        let error = serde_json::from_str::<'_, Span>(json).expect_err("missing start key");
        assert!(error.to_string().starts_with("missing field `start`"));
    }

    #[cfg(feature = "serde")]
    #[test]
    fn deserialize_duplicate_key() {
        use crate::Span;

        let json = r#"{"start":10,"start":20}"#;
        let error = serde_json::from_str::<'_, Span>(json).expect_err("duplicate start key");
        assert!(error.to_string().starts_with("duplicate field `start`"));

        let json = r#"{"end":10,"end":20}"#;
        let error = serde_json::from_str::<'_, Span>(json).expect_err("duplicate end key");
        assert!(error.to_string().starts_with("duplicate field `end`"));
    }
}
