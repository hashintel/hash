use alloc::collections::BTreeMap;
use core::fmt::Debug;

use serde::de::IntoDeserializer;
use serde_value::Value;
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
        // in theory this could be made allocation free (mostly), by having a `SpanKey<O>`, then
        // having a delegate function, but that would be a lot more involved.
        let mut value = BTreeMap::<Value, Value>::deserialize(deserializer)?;
        let Some(parent) = value.remove(&Value::String("parent".to_owned())) else {
            return Err(serde::de::Error::missing_field("parent"));
        };

        let parent = Option::<Box<Self>>::deserialize(parent).map_err(serde::de::Error::custom)?;

        let value = value.into_deserializer();
        let value = Span::decode(value).map_err(serde::de::Error::custom)?;

        Ok(Self { value, parent })
    }
}
