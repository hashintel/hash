use serde::{ser::SerializeMap, Deserializer};

pub trait SpanEncode: Sized {
    fn size_hint(&self) -> Option<usize> {
        None
    }

    fn encode<M>(&self, serializer: &mut M) -> Result<M::Ok, M::Error>
    where
        M: SerializeMap;

    /// Decode a span from a map
    ///
    /// The deserializer will always be a map deserializer
    fn decode<'de, D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>;
}
