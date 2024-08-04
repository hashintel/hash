use core::fmt::Debug;

use serde::de::value::MapAccessDeserializer;
use text_size::{TextRange, TextSize};

use crate::Span;

/// Represents a full span in a file.
///
/// This span is resolved unlike a normal span, where each parent is resolved to a full span.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SpanNode<S> {
    pub value: S,
    pub parent: Option<Box<SpanNode<S>>>,
}

impl<S> SpanNode<S>
where
    S: Span,
{
    /// Convert the potentially relative span into an absolute span.
    pub fn absolute(&self) -> TextRange {
        let parent_offset = self
            .parent
            .as_ref()
            .map_or_else(|| TextSize::from(0), |parent| parent.absolute().start());

        self.value.range() + parent_offset
    }
}

impl<Span> serde::Serialize for SpanNode<Span>
where
    Span: crate::encoding::SpanEncode,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;

        let size_hint = self.value.size_hint().map(|hint| hint + 1);
        let mut map = serializer.serialize_map(size_hint)?;
        self.value.encode(&mut map)?;
        map.serialize_entry("parent", &self.parent)?;
        map.end()
    }
}

impl<'de, Span> serde::Deserialize<'de> for SpanNode<Span>
where
    Span: crate::encoding::SpanEncode,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::MapAccess;

        struct SpanNodeVisitor<Span> {
            _phantom: core::marker::PhantomData<Span>,
        }

        impl<'de, Span> serde::de::Visitor<'de> for SpanNodeVisitor<Span>
        where
            Span: crate::encoding::SpanEncode,
        {
            type Value = SpanNode<Span>;

            fn expecting(&self, formatter: &mut core::fmt::Formatter) -> core::fmt::Result {
                formatter.write_str("a span node")
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                Ok(SpanNode { value, parent })
            }
        }

        deserializer.deserialize_map(SpanNodeVisitor {
            _phantom: core::marker::PhantomData,
        })
    }
}
