use core::fmt::{self, Debug};

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
    Self: 'de,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct NodeVisitor<Span> {
            _marker: core::marker::PhantomData<fn() -> *const Span>,
        }

        impl<'de, Span> serde::de::Visitor<'de> for NodeVisitor<Span>
        where
            Span: crate::encoding::SpanEncode,
            Self: 'de,
        {
            type Value = SpanNode<Span>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a span node with a parent field")
            }

            fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::MapAccess<'de>,
            {
                let mut parent = None;

                let access = crate::encoding::SpanAccessDeserializer {
                    access: map,
                    parent: &mut parent,
                };

                let value = Span::decode(access)?;
                let Some(parent) = parent else {
                    return Err(serde::de::Error::missing_field("parent"));
                };

                Ok(SpanNode { value, parent })
            }
        }

        deserializer.deserialize_map(NodeVisitor {
            _marker: core::marker::PhantomData,
        })
    }
}
