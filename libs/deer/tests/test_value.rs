use deer::{
    error::{DeserializeError, ExpectedType, ReceivedValue, ValueError, Variant, VisitorError},
    value::{
        BoolDeserializer, BorrowedStrDeserializer, BytesDeserializer, CharDeserializer,
        F32Deserializer, F64Deserializer, I128Deserializer, I16Deserializer, I32Deserializer,
        I64Deserializer, I8Deserializer, IsizeDeserializer, NumberDeserializer, StrDeserializer,
        U128Deserializer, U16Deserializer, U32Deserializer, U64Deserializer, U8Deserializer,
        UsizeDeserializer,
    },
    Context, Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
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
}

// TODO: None, Null, number, bytes, bytes_buffer, borrowed_bytes, ArrayAccess,
//  ObjectAccess
