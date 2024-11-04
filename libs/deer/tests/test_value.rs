use deer::{
    Context, Deserialize, Deserializer, Document, Number, Reflection, Schema, Visitor,
    error::{
        DeserializeError, ExpectedType, ReceivedValue, ValueError, Variant as _, VisitorError,
    },
    value::{
        BoolDeserializer, BorrowedBytesDeserializer, BorrowedStrDeserializer,
        BytesBufferDeserializer, BytesDeserializer, CharDeserializer, F32Deserializer,
        F64Deserializer, I8Deserializer, I16Deserializer, I32Deserializer, I64Deserializer,
        I128Deserializer, IntoDeserializer as _, IsizeDeserializer, NullDeserializer,
        NumberDeserializer, StrDeserializer, U8Deserializer, U16Deserializer, U32Deserializer,
        U64Deserializer, U128Deserializer, UsizeDeserializer,
    },
};
use error_stack::{Report, ResultExt as _};
use proptest::prelude::*;

macro_rules! generate_proptest {
    ($ty:ty,not($err:ty)) => {
        paste::paste! {
            #[test]
            #[cfg(not(miri))]
            #[allow(clippy::float_cmp, reason = "we're dealing with the same float, therefore should be the same!")]
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
            #[allow(clippy::float_cmp, reason = "we're dealing with the same float, therefore should be the same!")]
            fn [< $ty _into_deserializer_ok >]() {
                let context = Context::new();

                proptest!(move |(expected in any::<$ty>())| {
                    let de = expected.into_deserializer(&context);
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

generate_proptest!(u8, not(char));
generate_proptest!(u16, not(char));
generate_proptest!(u32, not(char));
generate_proptest!(u64, not(char));
generate_proptest!(u128, not(char));
generate_proptest!(usize, not(char));
generate_proptest!(i8, not(char));
generate_proptest!(i16, not(char));
generate_proptest!(i32, not(char));
generate_proptest!(i64, not(char));
generate_proptest!(i128, not(char));
generate_proptest!(isize, not(char));
generate_proptest!(f32, not(char));
generate_proptest!(f64, not(char));
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
            Self::Yes => "yes",
            Self::No => "no",
        }
    }
}

impl Reflection for Choice {
    fn schema(doc: &mut Document) -> Schema {
        str::schema(doc).with("enum", ["yes", "no"])
    }
}

struct ChoiceVisitor;

impl Visitor<'_> for ChoiceVisitor {
    type Value = Choice;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_str(self, value: &str) -> Result<Self::Value, Report<VisitorError>> {
        match value {
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

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_str(ChoiceVisitor)
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

impl Visitor<'_> for NullVisitor {
    type Value = Null;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_null(self) -> Result<Self::Value, Report<VisitorError>> {
        Ok(Null)
    }
}

impl<'de> Deserialize<'de> for Null {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_null(NullVisitor)
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
    fn str_into_deserializer_ok(expected in choice_strategy()) {
        let context = Context::new();


        let de = expected.into_str().into_deserializer(&context);
        let received = Choice::deserialize(de).expect("able to deserialize");

        assert_eq!(expected, received);
    }

    #[test]
    fn str_err(expected in any::<String>()) {
        let context = Context::new();

        let de = StrDeserializer::new(&expected, &context);
        let result = u8::deserialize(de);

        _ = result.expect_err("should not be able to deserialize");
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

        _ = result.expect_err("should not be able to deserialize");
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

        _ = result.expect_err("should not be able to deserialize");
    }
}

#[test]
fn null_ok() {
    let context = Context::new();

    let de = NullDeserializer::new(&context);
    _ = Null::deserialize(de).expect("able to deserializer");
}

#[test]
fn null_err() {
    let context = Context::new();

    let de = NullDeserializer::new(&context);
    let result = u8::deserialize(de);

    _ = result.expect_err("should not be able to deserialize");
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

    fn visit_borrowed_bytes(self, value: &'de [u8]) -> Result<Self::Value, Report<VisitorError>> {
        Ok(Bytes(value))
    }
}

impl<'de: 'a, 'a> Deserialize<'de> for Bytes<'a> {
    type Reflection = Bytes<'static>;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_bytes(BytesVisitor)
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

impl Visitor<'_> for BytesLengthVisitor {
    type Value = BytesLength;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_bytes(self, value: &[u8]) -> Result<Self::Value, Report<VisitorError>> {
        Ok(BytesLength(value.len()))
    }
}

impl<'de> Deserialize<'de> for BytesLength {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_bytes(BytesLengthVisitor)
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

impl Visitor<'_> for ByteBufferVisitor {
    type Value = ByteBuffer;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_bytes_buffer(self, value: Vec<u8>) -> Result<Self::Value, Report<VisitorError>> {
        Ok(ByteBuffer(value))
    }
}

impl<'de> Deserialize<'de> for ByteBuffer {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_bytes_buffer(ByteBufferVisitor)
            .change_context(DeserializeError)
    }
}

#[cfg(not(miri))]
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

        _ = result.expect_err("should not be able to deserialize");
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
    fn bytes_into_deserializer_ok(expected in any::<Vec<u8>>()) {
        let context = Context::new();
        let value = expected.as_slice();

        let de = value.into_deserializer(&context);
        let received = BytesLength::deserialize(de).expect("should be able to deserialize");

        assert_eq!(value.len(), received.0);
    }

    #[test]
    fn bytes_err(expected in any::<Vec<u8>>()) {
        let context = Context::new();
        let value = expected.as_slice();

        let de = BytesDeserializer::new(value, &context);
        let result = u8::deserialize(de);

        _ = result.expect_err("should not be able to deserialize");
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

        _ = result.expect_err("should not be able to deserialize");
    }
}

// These are so trivial that we don't need to test them right now: ArrayAccess, ObjectAccess
//  (would be nice tho)
// TODO: none requires a HashMap<> impl first
// TODO: string requires a String impl first
