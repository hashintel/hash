use deer::{
    error::{DeserializeError, ExpectedType, ReceivedValue, ValueError, Variant, VisitorError},
    value::{
        BoolDeserializer, BorrowedBytesDeserializer, BorrowedStrDeserializer,
        BytesBufferDeserializer, BytesDeserializer, CharDeserializer, F32Deserializer,
        F64Deserializer, I128Deserializer, I16Deserializer, I32Deserializer, I64Deserializer,
        I8Deserializer, IsizeDeserializer, NullDeserializer, NumberDeserializer, StrDeserializer,
        U128Deserializer, U16Deserializer, U32Deserializer, U64Deserializer, U8Deserializer,
        UsizeDeserializer,
    },
    Context, Deserialize, Deserializer, Document, Number, Reflection, Schema, Visitor,
};
use error_stack::{Report, Result, ResultExt};
use proptest::prelude::*;

macro_rules! generate_proptest {
    ($ty:ty,not($err:ty)) => {
        paste::paste! {
            #[test]
            #[cfg(not(miri))]
            fn [< $ty _ok >]() {
                let context = Context::new();

                proptest!(move |(expected in any::<$ty>())| {
                    let de = [< $ty:camel Deserializer >]::new(expected, &context);
                    let received = <$ty>::deserialize(de).expect("able to deserialize");

                    assert_eq!(expected, received);
                });
            }

            #[test]
            #[cfg(not(miri))]
            fn [< $ty _err >]() {
                let context = Context::new();

                proptest!(move |(expected in any::<$ty>())| {
                    let de = [< $ty:camel Deserializer >]::new(expected, &context);
                    let result = <$err>::deserialize(de);

                    assert!(result.is_err());
                });
            }
        }
    };
}

generate_proptest!(u8, not(u16));
generate_proptest!(u16, not(u32));
generate_proptest!(u32, not(u64));
generate_proptest!(u64, not(u128));
generate_proptest!(u128, not(u8));
generate_proptest!(usize, not(u8));
generate_proptest!(i8, not(i16));
generate_proptest!(i16, not(i32));
generate_proptest!(i32, not(i64));
generate_proptest!(i64, not(i128));
generate_proptest!(i128, not(i8));
generate_proptest!(isize, not(i8));
generate_proptest!(f32, not(i8));
generate_proptest!(f64, not(i8));
generate_proptest!(bool, not(i8));
generate_proptest!(char, not(i8));

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum Choice {
    Yes,
    No,
}

impl Choice {
    const fn into_str(self) -> &'static str {
        match self {
            Choice::Yes => "yes",
            Choice::No => "no",
        }
    }
}

impl Reflection for Choice {
    fn schema(doc: &mut Document) -> Schema {
        str::schema(doc).with("enum", ["yes", "no"])
    }
}

struct ChoiceVisitor;

impl<'de> Visitor<'de> for ChoiceVisitor {
    type Value = Choice;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
        match v {
            "yes" => Ok(Choice::Yes),
            "no" => Ok(Choice::No),
            other => Err(Report::new(ValueError.into_error())
                .attach(ReceivedValue::new(other.to_owned()))
                .attach(ExpectedType::new(self.expecting()))
                .change_context(VisitorError)),
        }
    }
}

impl<'de> Deserialize<'de> for Choice {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_str(ChoiceVisitor)
            .change_context(DeserializeError)
    }
}

struct Null;

impl Reflection for Null {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("null")
    }
}

struct NullVisitor;

impl<'de> Visitor<'de> for NullVisitor {
    type Value = Null;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_null(self) -> Result<Self::Value, VisitorError> {
        Ok(Null)
    }
}

impl<'de> Deserialize<'de> for Null {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_null(NullVisitor)
            .change_context(DeserializeError)
    }
}

prop_compose! {
    fn choice_strategy()(base in any::<bool>()) -> Choice {
        if base {Choice::Yes} else {Choice::No}
    }
}

#[cfg(not(miri))]
proptest! {
    #[test]
    fn str_ok(expected in choice_strategy()) {
        let context = Context::new();


        let de = StrDeserializer::new(expected.into_str(), &context);
        let received = Choice::deserialize(de).expect("able to deserialize");

        assert_eq!(expected, received);
    }

    #[test]
    fn str_err(expected in any::<String>()) {
        let context = Context::new();

        let de = StrDeserializer::new(&expected, &context);
        let result = u8::deserialize(de);

        assert!(result.is_err());
    }

    #[test]
    fn borrowed_str_ok(expected in any::<String>()) {
        let context = Context::new();
        let value = expected.as_str();

        let de = BorrowedStrDeserializer::new(value, &context);
        let received = <&str>::deserialize(de).expect("able to deserialize");

        assert_eq!(expected, received);
    }

    #[test]
    fn borrowed_str_err(expected in any::<String>()) {
        let context = Context::new();
        let value = expected.as_str();

        let de = BorrowedStrDeserializer::new(value, &context);
        let result = u8::deserialize(de);

        assert!(result.is_err());
    }

    // TODO: deserialize no yet implemented for alloc
    // #[test]
    // fn string_ok(expected in any::<String>()) {
    //     let context = Context::new();
    //
    //     let de = StringDeserializer::new(expected, &context);
    //     let received = String::deserialize(de).expect("able to deserialize");
    //
    //     assert_eq!(expected, received);
    // }
    //
    // #[test]
    // fn string_err(expected in any::<String>()) {
    //     let context = Context::new();
    //
    //     let de = StringDeserializer::new(expected, &context);
    //     let result = u8::deserialize(de);
    //
    //     assert!(result.is_err());
    // }

    #[test]
    fn number_ok(expected in any::<u8>()) {
        let context = Context::new();
        let value = Number::from(expected);

        let de = NumberDeserializer::new(value.clone(), &context);
        let received = Number::deserialize(de).expect("able to deserialize");

        assert_eq!(value, received);
    }

    #[test]
    fn number_err(expected in any::<u8>()) {
        let context = Context::new();
        let value = Number::from(expected);

        let de = NumberDeserializer::new(value, &context);
        let result = <&str>::deserialize(de);

        assert!(result.is_err());
    }
}

#[test]
fn null_ok() {
    let context = Context::new();

    let de = NullDeserializer::new(&context);
    let _ = Null::deserialize(de).expect("able to deserializer");
}

#[test]
fn null_err() {
    let context = Context::new();

    let de = NullDeserializer::new(&context);
    let result = u8::deserialize(de);

    assert!(result.is_err());
}

struct Bytes<'a>(&'a [u8]);

impl Reflection for Bytes<'static> {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("binary")
    }
}

struct BytesVisitor;

impl<'de> Visitor<'de> for BytesVisitor {
    type Value = Bytes<'de>;

    fn expecting(&self) -> Document {
        Bytes::document()
    }

    fn visit_borrowed_bytes(self, v: &'de [u8]) -> Result<Self::Value, VisitorError> {
        Ok(Bytes(v))
    }
}

impl<'de: 'a, 'a> Deserialize<'de> for Bytes<'a> {
    type Reflection = Bytes<'static>;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_bytes(BytesVisitor)
            .change_context(DeserializeError)
    }
}

struct BytesLength(usize);

impl Reflection for BytesLength {
    fn schema(doc: &mut Document) -> Schema {
        usize::schema(doc)
    }
}

struct BytesLengthVisitor;

impl<'de> Visitor<'de> for BytesLengthVisitor {
    type Value = BytesLength;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
        Ok(BytesLength(v.len()))
    }
}

impl<'de> Deserialize<'de> for BytesLength {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_bytes(BytesLengthVisitor)
            .change_context(DeserializeError)
    }
}

struct ByteBuffer(Vec<u8>);

impl Reflection for ByteBuffer {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("binary")
    }
}

struct ByteBufferVisitor;

impl<'de> Visitor<'de> for ByteBufferVisitor {
    type Value = ByteBuffer;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_bytes_buffer(self, v: Vec<u8>) -> Result<Self::Value, VisitorError> {
        Ok(ByteBuffer(v))
    }
}

impl<'de> Deserialize<'de> for ByteBuffer {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_bytes_buffer(ByteBufferVisitor)
            .change_context(DeserializeError)
    }
}

proptest! {
    #[test]
    fn borrowed_bytes_ok(expected in any::<Vec<u8>>()) {
        let context = Context::new();
        let value = expected.as_slice();

        let de = BorrowedBytesDeserializer::new(value, &context);
        let received = Bytes::deserialize(de).expect("should be able to deserialize");

        assert_eq!(value, received.0);
    }

    #[test]
    fn borrowed_bytes_err(expected in any::<Vec<u8>>()) {
        let context = Context::new();
        let value = expected.as_slice();

        let de = BorrowedBytesDeserializer::new(value, &context);
        let result = u8::deserialize(de);

        assert!(result.is_err());
    }

    #[test]
    fn bytes_ok(expected in any::<Vec<u8>>()) {
        let context = Context::new();
        let value = expected.as_slice();

        let de = BytesDeserializer::new(value, &context);
        let received = BytesLength::deserialize(de).expect("should be able to deserialize");

        assert_eq!(value.len(), received.0);
    }

    #[test]
    fn bytes_err(expected in any::<Vec<u8>>()) {
        let context = Context::new();
        let value = expected.as_slice();

        let de = BytesDeserializer::new(value, &context);
        let result = u8::deserialize(de);

        assert!(result.is_err());
    }

    #[test]
    fn byte_buffer_ok(expected in any::<Vec<u8>>()) {
        let context = Context::new();

        let de = BytesBufferDeserializer::new(expected.clone(), &context);
        let received = ByteBuffer::deserialize(de).expect("should be able to deserialize");

        assert_eq!(expected, received.0);
    }

    #[test]
    fn byte_buffer_err(expected in any::<Vec<u8>>()) {
        let context = Context::new();

        let de = BytesBufferDeserializer::new(expected, &context);
        let result = u8::deserialize(de);

        assert!(result.is_err());
    }
}

// These are so trivial that we don't need to test them right now: ArrayAccess, ObjectAccess
//  (would be nice tho)
// TODO: none requires a HashMap<> impl first
// TODO: string requires a String impl first
