use serde::{
    de::{
        value::{EnumAccessDeserializer, MapAccessDeserializer, SeqAccessDeserializer},
        DeserializeSeed, IntoDeserializer, MapAccess, Visitor,
    },
    ser::SerializeMap,
    Deserialize, Deserializer,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum ReservedSpanField {
    Parent,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum SpanField<S, O> {
    Reserved {
        field: ReservedSpanField,
        // S is seed, to be used to deserialize other
        seed: S,
    },
    Other(O),
}

struct SpanFieldVisitor<S> {
    other: S,
}

impl<'de, S> Visitor<'de> for SpanFieldVisitor<S>
where
    S: serde::de::DeserializeSeed<'de>,
{
    type Value = SpanField<S, S::Value>;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("a span field")
    }

    fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_i8<E>(self, v: i8) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_i16<E>(self, v: i16) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_i32<E>(self, v: i32) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_i128<E>(self, v: i128) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_u8<E>(self, v: u8) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_u16<E>(self, v: u16) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_u32<E>(self, v: u32) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_u128<E>(self, v: u128) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_f32<E>(self, v: f32) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_char<E>(self, v: char) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(v.into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if v.eq_ignore_ascii_case("parent") {
            Ok(SpanField::Reserved {
                field: ReservedSpanField::Parent,
                seed: self.other,
            })
        } else {
            self.other
                .deserialize(v.into_deserializer())
                .map(SpanField::Other)
        }
    }

    fn visit_borrowed_str<E>(self, v: &'de str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if v.eq_ignore_ascii_case("parent") {
            Ok(SpanField::Reserved {
                field: ReservedSpanField::Parent,
                seed: self.other,
            })
        } else {
            self.other
                .deserialize(v.into_deserializer())
                .map(SpanField::Other)
        }
    }

    fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if v.eq_ignore_ascii_case("parent") {
            Ok(SpanField::Reserved {
                field: ReservedSpanField::Parent,
                seed: self.other,
            })
        } else {
            self.other
                .deserialize(v.into_deserializer())
                .map(SpanField::Other)
        }
    }

    fn visit_bytes<E>(self, v: &[u8]) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if v.eq_ignore_ascii_case(b"parent") {
            Ok(SpanField::Reserved {
                field: ReservedSpanField::Parent,
                seed: self.other,
            })
        } else {
            self.other
                .deserialize(v.into_deserializer())
                .map(SpanField::Other)
        }
    }

    fn visit_borrowed_bytes<E>(self, v: &'de [u8]) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if v.eq_ignore_ascii_case(b"parent") {
            Ok(SpanField::Reserved {
                field: ReservedSpanField::Parent,
                seed: self.other,
            })
        } else {
            self.other
                .deserialize(v.into_deserializer())
                .map(SpanField::Other)
        }
    }

    fn visit_byte_buf<E>(self, v: Vec<u8>) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if v.eq_ignore_ascii_case(b"parent") {
            Ok(SpanField::Reserved {
                field: ReservedSpanField::Parent,
                seed: self.other,
            })
        } else {
            self.other
                .deserialize(v.into_deserializer())
                .map(SpanField::Other)
        }
    }

    // `visit_none` / `visit_some` don't have a value deserializer, therefore are not implemented.

    fn visit_unit<E>(self) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        self.other
            .deserialize(().into_deserializer())
            .map(SpanField::Other)
    }

    fn visit_newtype_struct<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        self.other.deserialize(deserializer).map(SpanField::Other)
    }

    fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
    where
        A: serde::de::SeqAccess<'de>,
    {
        self.other
            .deserialize(SeqAccessDeserializer::new(seq))
            .map(SpanField::Other)
    }

    fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        self.other
            .deserialize(MapAccessDeserializer::new(map))
            .map(SpanField::Other)
    }

    fn visit_enum<A>(self, data: A) -> Result<Self::Value, A::Error>
    where
        A: serde::de::EnumAccess<'de>,
    {
        self.other
            .deserialize(EnumAccessDeserializer::new(data))
            .map(SpanField::Other)
    }
}

impl<'de, O> DeserializeSeed<'de> for SpanFieldVisitor<O>
where
    O: DeserializeSeed<'de>,
{
    type Value = SpanField<O, O::Value>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_identifier(self)
    }
}

pub(crate) struct SpanAccessDeserializer<'a, A, P> {
    pub access: A,
    pub parent: &'a mut Option<P>,
}

impl<'a, 'de, A, P> MapAccess<'de> for SpanAccessDeserializer<'a, A, P>
where
    A: MapAccess<'de>,
    P: Deserialize<'de>,
{
    type Error = A::Error;

    fn next_key_seed<K>(&mut self, seed: K) -> Result<Option<K::Value>, Self::Error>
    where
        K: serde::de::DeserializeSeed<'de>,
    {
        let key = self
            .access
            .next_key_seed(SpanFieldVisitor { other: seed })?;

        match key {
            Some(SpanField::Reserved {
                field: ReservedSpanField::Parent,
                seed: _,
            }) if self.parent.is_some() => Err(serde::de::Error::duplicate_field("parent")),
            Some(SpanField::Reserved {
                field: ReservedSpanField::Parent,
                seed,
            }) => {
                *self.parent = Some(self.access.next_value()?);

                // recurse to get the next key, in case it is a reserved key as well get the value
                self.next_key_seed(seed)
            }
            Some(SpanField::Other(other)) => Ok(Some(other)),
            None => Ok(None),
        }
    }

    fn next_value_seed<V>(&mut self, seed: V) -> Result<V::Value, Self::Error>
    where
        V: serde::de::DeserializeSeed<'de>,
    {
        self.access.next_value_seed(seed)
    }
}

/// Encode a span into a map
///
/// This trait is used to encode a span into a map. The map will always be a map serializer and
/// deserializer.
///
/// The key `parent` is reserved, and will be used by the [`SpanNode`] to store the parent span.
///
/// [`SpanNode`]: crate::tree::SpanNode
pub trait SpanEncode: Sized {
    /// The size hint is used to provide a hint to the serializer about how many entries will be in
    /// the map. This is useful for serializers that can pre-allocate space for the map.
    fn size_hint(&self) -> Option<usize> {
        None
    }

    fn encode<M>(&self, map: &mut M) -> Result<M::Ok, M::Error>
    where
        M: SerializeMap;

    /// Decode a span from a map
    ///
    /// The deserializer will always be a map deserializer
    fn decode<'de, A>(map: A) -> Result<Self, A::Error>
    where
        A: MapAccess<'de>,
        Self: 'de;
}
