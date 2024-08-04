use core::marker::PhantomData;

use serde::{
    de::{
        value::{EnumAccessDeserializer, MapAccessDeserializer, SeqAccessDeserializer},
        DeserializeSeed, IntoDeserializer, MapAccess,
    },
    ser::SerializeMap,
    Deserialize, Deserializer,
};

enum SpanKey<O> {
    Parent,
    Other(O),
}

impl<'de, O> Deserialize<'de> for SpanKey<O>
where
    O: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct KeyVisitor<O>(PhantomData<O>);

        impl<'de, O> serde::de::Visitor<'de> for KeyVisitor<O>
        where
            O: Deserialize<'de>,
        {
            type Value = SpanKey<O>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a span key")
            }

            fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_i8<E>(self, v: i8) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_i16<E>(self, v: i16) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_i32<E>(self, v: i32) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_i128<E>(self, v: i128) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_u8<E>(self, v: u8) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_u16<E>(self, v: u16) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_u32<E>(self, v: u32) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_u128<E>(self, v: u128) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_f32<E>(self, v: f32) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_char<E>(self, v: char) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(v.into_deserializer()).map(SpanKey::Other)
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if v.eq_ignore_ascii_case("parent") {
                    Ok(SpanKey::Parent)
                } else {
                    O::deserialize(v.into_deserializer()).map(SpanKey::Other)
                }
            }

            fn visit_borrowed_str<E>(self, v: &'de str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if v.eq_ignore_ascii_case("parent") {
                    Ok(SpanKey::Parent)
                } else {
                    O::deserialize(v.into_deserializer()).map(SpanKey::Other)
                }
            }

            fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if v.eq_ignore_ascii_case("parent") {
                    Ok(SpanKey::Parent)
                } else {
                    O::deserialize(v.into_deserializer()).map(SpanKey::Other)
                }
            }

            fn visit_bytes<E>(self, v: &[u8]) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if v.eq_ignore_ascii_case(b"parent") {
                    Ok(SpanKey::Parent)
                } else {
                    O::deserialize(v.into_deserializer()).map(SpanKey::Other)
                }
            }

            fn visit_borrowed_bytes<E>(self, v: &'de [u8]) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if v.eq_ignore_ascii_case(b"parent") {
                    Ok(SpanKey::Parent)
                } else {
                    O::deserialize(v.into_deserializer()).map(SpanKey::Other)
                }
            }

            fn visit_byte_buf<E>(self, v: Vec<u8>) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if v.eq_ignore_ascii_case(b"parent") {
                    Ok(SpanKey::Parent)
                } else {
                    O::deserialize(v.into_deserializer()).map(SpanKey::Other)
                }
            }

            // visit_none and visit_some are not implemented, because they don't have a
            // `serde::de::value` Deserializer, see: https://github.com/serde-rs/serde/issues/1899

            fn visit_unit<E>(self) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                O::deserialize(().into_deserializer()).map(SpanKey::Other)
            }

            fn visit_newtype_struct<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: Deserializer<'de>,
            {
                O::deserialize(deserializer).map(SpanKey::Other)
            }

            fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::SeqAccess<'de>,
            {
                O::deserialize(SeqAccessDeserializer::new(seq)).map(SpanKey::Other)
            }

            fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                O::deserialize(MapAccessDeserializer::new(map)).map(SpanKey::Other)
            }

            fn visit_enum<A>(self, data: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::EnumAccess<'de>,
            {
                O::deserialize(EnumAccessDeserializer::new(data)).map(SpanKey::Other)
            }
        }

        deserializer.deserialize_any(KeyVisitor(PhantomData))
    }
}

pub trait SpanEncode: Sized {
    fn size_hint(&self) -> Option<usize> {
        None
    }

    fn encode<M>(&self, serializer: &mut M) -> Result<M::Ok, M::Error>
    where
        M: SerializeMap;

    /// Decode a span from a map
    ///
    /// Certain keys are reserved for internal use, and are passed to the delegate function, these
    /// keys should be deserialized using the delegate function.
    fn decode<'de, A, S>(
        deserializer: &mut A,
        delegate: impl FnMut(SpanKey) -> S,
    ) -> Result<Self, A::Error>
    where
        A: MapAccess<'de>,
        S: DeserializeSeed<'de, Value = ()>,
        Self: 'de;
}
