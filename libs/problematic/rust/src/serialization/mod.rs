use core::fmt::Display;

use serde::{
    Serialize, Serializer,
    ser::{Error, Impossible, SerializeMap, SerializeStruct},
};

mod key;

struct ExtensionKey<'a, T: ?Sized>(&'a T);

/// Serializes an extension object, rejecting non-objects and reserved member names.
///
/// # Errors
///
/// Returns the serializer's error for invalid extensions or failures in the underlying serializer.
pub(crate) fn serialize_extensions<E: Serialize, S: Serializer>(
    extensions: &E,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    extensions.serialize(ExtensionSerializer(serializer))
}

fn check_member<E: Error>(name: &str) -> Result<(), E> {
    if matches!(name, "type" | "title" | "status" | "detail" | "instance") {
        return Err(E::custom(format_args!(
            "problem extension `{name}` conflicts with a standard member"
        )));
    }
    Ok(())
}

struct ExtensionSerializer<S>(S);

macro_rules! reject_scalar {
    ($($method:ident($type:ty)),* $(,)?) => {
        $(
            fn $method(self, _: $type) -> Result<Self::Ok, Self::Error> {
                Err(Self::Error::custom("problem extensions must serialize as an object"))
            }
        )*
    };
}

impl<S: Serializer> Serializer for ExtensionSerializer<S> {
    type Error = S::Error;
    type Ok = S::Ok;
    type SerializeMap = ExtensionMembers<S::SerializeMap>;
    type SerializeSeq = Impossible<Self::Ok, Self::Error>;
    type SerializeStruct = ExtensionMembers<S::SerializeStruct>;
    type SerializeStructVariant = S::SerializeStructVariant;
    type SerializeTuple = Impossible<Self::Ok, Self::Error>;
    type SerializeTupleStruct = Impossible<Self::Ok, Self::Error>;
    type SerializeTupleVariant = S::SerializeTupleVariant;

    reject_scalar! {
        serialize_bool(bool),
        serialize_i8(i8), serialize_i16(i16), serialize_i32(i32), serialize_i64(i64),
        serialize_i128(i128),
        serialize_u8(u8), serialize_u16(u16), serialize_u32(u32), serialize_u64(u64),
        serialize_u128(u128),
        serialize_f32(f32), serialize_f64(f64),
        serialize_char(char), serialize_str(&str), serialize_bytes(&[u8]),
    }

    fn serialize_none(self) -> Result<Self::Ok, Self::Error> {
        self.serialize_unit()
    }

    fn serialize_some<T: ?Sized + Serialize>(self, value: &T) -> Result<Self::Ok, Self::Error> {
        value.serialize(self)
    }

    fn serialize_unit(self) -> Result<Self::Ok, Self::Error> {
        Err(Self::Error::custom(
            "problem extensions must serialize as an object",
        ))
    }

    fn serialize_unit_struct(self, _: &'static str) -> Result<Self::Ok, Self::Error> {
        self.serialize_unit()
    }

    fn serialize_unit_variant(
        self,
        _: &'static str,
        _: u32,
        _: &'static str,
    ) -> Result<Self::Ok, Self::Error> {
        self.serialize_unit()
    }

    fn serialize_newtype_struct<T: ?Sized + Serialize>(
        self,
        _: &'static str,
        value: &T,
    ) -> Result<Self::Ok, Self::Error> {
        value.serialize(self)
    }

    fn serialize_newtype_variant<T: ?Sized + Serialize>(
        self,
        name: &'static str,
        variant_index: u32,
        variant: &'static str,
        value: &T,
    ) -> Result<Self::Ok, Self::Error> {
        check_member::<Self::Error>(variant)?;
        self.0
            .serialize_newtype_variant(name, variant_index, variant, value)
    }

    fn serialize_seq(self, _: Option<usize>) -> Result<Self::SerializeSeq, Self::Error> {
        Err(Self::Error::custom(
            "problem extensions must serialize as an object",
        ))
    }

    fn serialize_tuple(self, _: usize) -> Result<Self::SerializeTuple, Self::Error> {
        Err(Self::Error::custom(
            "problem extensions must serialize as an object",
        ))
    }

    fn serialize_tuple_struct(
        self,
        _: &'static str,
        _: usize,
    ) -> Result<Self::SerializeTupleStruct, Self::Error> {
        Err(Self::Error::custom(
            "problem extensions must serialize as an object",
        ))
    }

    fn serialize_tuple_variant(
        self,
        name: &'static str,
        variant_index: u32,
        variant: &'static str,
        len: usize,
    ) -> Result<Self::SerializeTupleVariant, Self::Error> {
        check_member::<Self::Error>(variant)?;
        self.0
            .serialize_tuple_variant(name, variant_index, variant, len)
    }

    fn serialize_map(self, len: Option<usize>) -> Result<Self::SerializeMap, Self::Error> {
        self.0.serialize_map(len).map(ExtensionMembers)
    }

    fn serialize_struct(
        self,
        name: &'static str,
        len: usize,
    ) -> Result<Self::SerializeStruct, Self::Error> {
        self.0.serialize_struct(name, len).map(ExtensionMembers)
    }

    fn serialize_struct_variant(
        self,
        name: &'static str,
        variant_index: u32,
        variant: &'static str,
        len: usize,
    ) -> Result<Self::SerializeStructVariant, Self::Error> {
        check_member::<Self::Error>(variant)?;
        self.0
            .serialize_struct_variant(name, variant_index, variant, len)
    }

    fn collect_str<T: ?Sized + Display>(self, _: &T) -> Result<Self::Ok, Self::Error> {
        self.serialize_unit()
    }

    fn is_human_readable(&self) -> bool {
        self.0.is_human_readable()
    }
}

struct ExtensionMembers<S>(S);

impl<S: SerializeStruct> SerializeStruct for ExtensionMembers<S> {
    type Error = S::Error;
    type Ok = S::Ok;

    fn serialize_field<T: ?Sized + Serialize>(
        &mut self,
        key: &'static str,
        value: &T,
    ) -> Result<(), Self::Error> {
        check_member::<Self::Error>(key)?;
        self.0.serialize_field(key, value)
    }

    fn skip_field(&mut self, key: &'static str) -> Result<(), Self::Error> {
        self.0.skip_field(key)
    }

    fn end(self) -> Result<Self::Ok, Self::Error> {
        self.0.end()
    }
}

impl<S: SerializeMap> SerializeMap for ExtensionMembers<S> {
    type Error = S::Error;
    type Ok = S::Ok;

    fn serialize_key<T: ?Sized + Serialize>(&mut self, key: &T) -> Result<(), Self::Error> {
        self.0.serialize_key(&ExtensionKey(key))
    }

    fn serialize_value<T: ?Sized + Serialize>(&mut self, value: &T) -> Result<(), Self::Error> {
        self.0.serialize_value(value)
    }

    fn serialize_entry<K: ?Sized + Serialize, V: ?Sized + Serialize>(
        &mut self,
        key: &K,
        value: &V,
    ) -> Result<(), Self::Error> {
        self.0.serialize_entry(&ExtensionKey(key), value)
    }

    fn end(self) -> Result<Self::Ok, Self::Error> {
        self.0.end()
    }
}
