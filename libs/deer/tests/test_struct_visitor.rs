use deer::{
    error::{
        ArrayAccessError, ArrayLengthError, DeserializeError, ExpectedLength, ReceivedLength,
        Variant, VisitorError,
    },
    ArrayAccess, Deserialize, Deserializer, Document, FieldVisitor, ObjectAccess, Reflection,
    Schema, StructVisitor, Visitor,
};
use error_stack::{Report, Result, ResultExt};
use serde::{ser::SerializeMap, Serialize, Serializer};
use serde_json::json;

mod common;

use common::TupleExt;
use deer::{
    error::{
        ExpectedField, ExpectedType, Location, MissingError, ObjectAccessError, ReceivedField,
        UnknownFieldError,
    },
    schema::Reference,
};
use deer_desert::{assert_tokens, assert_tokens_error, error, Token};

#[derive(Debug, Eq, PartialEq)]
struct Example {
    a: u8,
    b: u16,
    c: u32,
}

struct ExampleFieldVisitor;

enum ExampleFieldDiscriminator {
    A,
    B,
    C,
}

impl Reflection for ExampleFieldDiscriminator {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string").with("enum", ["a", "b", "c"])
    }
}

impl<'de> Deserialize<'de> for ExampleFieldDiscriminator {
    type Reflection = Self;

    fn deserialize<D>(deserializer: D) -> Result<Self, DeserializeError>
    where
        D: Deserializer<'de>,
    {
        struct IdentVisitor;

        impl<'de> Visitor<'de> for IdentVisitor {
            type Value = ExampleFieldDiscriminator;

            fn expecting(&self) -> Document {
                Self::Value::reflection()
            }

            fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
                match v {
                    "a" => Ok(ExampleFieldDiscriminator::A),
                    "b" => Ok(ExampleFieldDiscriminator::B),
                    "c" => Ok(ExampleFieldDiscriminator::C),
                    other => Err(Report::new(UnknownFieldError.into_error())
                        .attach(ExpectedField::new("a"))
                        .attach(ExpectedField::new("b"))
                        .attach(ExpectedField::new("c"))
                        .attach(ReceivedField::new(other))
                        .change_context(VisitorError)),
                }
            }

            fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
                match v {
                    b"a" => Ok(ExampleFieldDiscriminator::A),
                    b"b" => Ok(ExampleFieldDiscriminator::B),
                    b"c" => Ok(ExampleFieldDiscriminator::C),
                    other => {
                        let mut error = Report::new(UnknownFieldError.into_error())
                            .attach(ExpectedField::new("a"))
                            .attach(ExpectedField::new("b"))
                            .attach(ExpectedField::new("c"));

                        if let Ok(other) = core::str::from_utf8(other) {
                            error = error.attach(ReceivedField::new(other));
                        }

                        Err(error.change_context(VisitorError))
                    }
                }
            }

            fn visit_u64(self, v: u64) -> Result<Self::Value, VisitorError> {
                match v {
                    0 => Ok(ExampleFieldDiscriminator::A),
                    1 => Ok(ExampleFieldDiscriminator::B),
                    2 => Ok(ExampleFieldDiscriminator::C),
                    // TODO: accommodate for numeric identifier, bytes identifier
                    _ => {
                        Err(Report::new(UnknownFieldError.into_error())
                            .change_context(VisitorError))
                    }
                }
            }
        }

        deserializer
            .deserialize_str(IdentVisitor)
            .change_context(DeserializeError)
    }
}

enum ExampleField {
    A(u8),
    B(u16),
    C(u32),
}

impl<'de> FieldVisitor<'de> for ExampleFieldVisitor {
    type Key = ExampleFieldDiscriminator;
    type Value = ExampleField;

    fn visit_value<D>(self, key: Self::Key, deserializer: D) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>,
    {
        match key {
            ExampleFieldDiscriminator::A => u8::deserialize(deserializer)
                .map(ExampleField::A)
                .attach(Location::Field("a"))
                .change_context(VisitorError),
            ExampleFieldDiscriminator::B => u16::deserialize(deserializer)
                .map(ExampleField::B)
                .attach(Location::Field("b"))
                .change_context(VisitorError),
            ExampleFieldDiscriminator::C => u32::deserialize(deserializer)
                .map(ExampleField::C)
                .attach(Location::Field("c"))
                .change_context(VisitorError),
        }
    }
}

struct ExampleVisitor;

impl<'de> StructVisitor<'de> for ExampleVisitor {
    type Value = Example;

    fn expecting(&self) -> Document {
        Example::reflection()
    }

    fn visit_array<A>(self, mut array: A) -> Result<Self::Value, VisitorError>
    where
        A: ArrayAccess<'de>,
    {
        array.set_bounded(3).change_context(VisitorError)?;

        // while the contract states that we're guaranteed to always `Some` for the first 3
        // due to set_bounded we make sure that even if implementations are not correct we are still
        // correct but doing `unwrap_or_else`.
        // TODO: we might be able to expose that through the type system?
        let a = array
            .next()
            .unwrap_or_else(|| {
                Err(Report::new(ArrayLengthError.into_error())
                    .attach(ExpectedLength::new(3))
                    .attach(ReceivedLength::new(0))
                    .change_context(ArrayAccessError))
            })
            .attach(Location::Tuple(0));

        let b = array
            .next()
            .unwrap_or_else(|| {
                Err(Report::new(ArrayLengthError.into_error())
                    .attach(ExpectedLength::new(3))
                    .attach(ReceivedLength::new(1))
                    .change_context(ArrayAccessError))
            })
            .attach(Location::Tuple(1));

        let c = array
            .next()
            .unwrap_or_else(|| {
                Err(Report::new(ArrayLengthError.into_error())
                    .attach(ExpectedLength::new(3))
                    .attach(ReceivedLength::new(2))
                    .change_context(ArrayAccessError))
            })
            .attach(Location::Tuple(2));

        let (a, b, c, _) = (a, b, c, array.end())
            .fold_reports()
            .change_context(VisitorError)?;

        Ok(Example { a, b, c })
    }

    fn visit_object<A>(self, mut object: A) -> Result<Self::Value, VisitorError>
    where
        A: ObjectAccess<'de>,
    {
        object.set_bounded(3).change_context(VisitorError)?;

        let mut a = None;
        let mut b = None;
        let mut c = None;

        let mut errors: Result<(), ObjectAccessError> = Ok(());

        while let Some(field) = object.field(ExampleFieldVisitor) {
            match field {
                Err(error) => match &mut errors {
                    Err(errors) => {
                        errors.extend_one(error);
                    }
                    errors => *errors = Err(error),
                },
                Ok(ExampleField::A(value)) => match &mut a {
                    // we have no error type for this!
                    Some(_) => unimplemented!("planned in follow up PR"),
                    a => *a = Some(value),
                },
                Ok(ExampleField::B(value)) => match &mut b {
                    Some(_) => unimplemented!("planned in follow up PR"),
                    b => *b = Some(value),
                },
                Ok(ExampleField::C(value)) => match &mut c {
                    Some(_) => unimplemented!("planned in follow up PR"),
                    c => *c = Some(value),
                },
            }
        }

        let a = a.ok_or_else(|| {
            Report::new(MissingError.into_error())
                .attach(ExpectedType::new(u8::reflection()))
                .attach(Location::Field("a"))
                .change_context(ObjectAccessError)
        });

        let b = b.ok_or_else(|| {
            Report::new(MissingError.into_error())
                .attach(ExpectedType::new(u16::reflection()))
                .attach(Location::Field("b"))
                .change_context(ObjectAccessError)
        });

        let c = c.ok_or_else(|| {
            Report::new(MissingError.into_error())
                .attach(ExpectedType::new(u32::reflection()))
                .attach(Location::Field("c"))
                .change_context(ObjectAccessError)
        });

        let (a, b, c, ..) = (a, b, c, errors, object.end())
            .fold_reports()
            .change_context(VisitorError)?;

        Ok(Example { a, b, c })
    }
}

struct Properties<const N: usize>([(&'static str, Reference); N]);

impl<const N: usize> Serialize for Properties<N> {
    fn serialize<S>(&self, serializer: S) -> core::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;

        for (key, value) in self.0 {
            map.serialize_entry(key, &value)?;
        }

        map.end()
    }
}

impl Reflection for Example {
    fn schema(doc: &mut Document) -> Schema {
        // TODO: we cannot express or constraints right now
        //  we would need to say: object if e.g. JSON-schema, other format might do both
        //  blueprint must support "struct"
        Schema::new("object").with(
            "properties",
            Properties([
                ("a", doc.add::<u8>()),
                ("b", doc.add::<u16>()),
                ("c", doc.add::<u32>()),
            ]),
        )
    }
}

impl<'de> Deserialize<'de> for Example {
    type Reflection = Self;

    fn deserialize<D>(deserializer: D) -> Result<Self, DeserializeError>
    where
        D: Deserializer<'de>,
    {
        deserializer
            .deserialize_struct(ExampleVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn struct_object_ok() {
    assert_tokens(&Example { a: 2, b: 3, c: 4 }, &[
        Token::Object { length: Some(3) },
        Token::Str("a"),
        Token::Number(2.into()),
        Token::Str("b"),
        Token::Number(3.into()),
        Token::Str("c"),
        Token::Number(4.into()),
        Token::ObjectEnd,
    ]);
}

#[test]
fn struct_object_out_of_order_ok() {
    assert_tokens(&Example { a: 2, b: 3, c: 4 }, &[
        Token::Object { length: Some(3) },
        Token::Str("c"),
        Token::Number(4.into()),
        Token::Str("b"),
        Token::Number(3.into()),
        Token::Str("a"),
        Token::Number(2.into()),
        Token::ObjectEnd,
    ]);
}

// TODO: key missing instead of value missing (or discriminant missing) ~> only possible with
//  IdentifierVisitor?
#[test]
fn struct_object_missing_err() {
    assert_tokens_error::<Example>(
        &error!([{
            ns: "deer",
            id: ["value", "missing"],
            properties: {
                "expected": u16::reflection(),
                "location": [{"type": "field", "value": "b"}]
            }
        }, {
            ns: "deer",
            // TODO: this should be key/discriminator missing! (or should this just silently fail?)
            id: ["value", "missing"],
            properties: {
                "expected": ExampleFieldDiscriminator::reflection(),
                "location": []
            }
        }]),
        &[
            Token::Object { length: Some(2) },
            Token::Str("a"),
            Token::Number(2.into()),
            Token::Str("c"),
            Token::Number(4.into()),
            Token::ObjectEnd,
        ],
    );
}

#[test]
fn struct_object_missing_multiple_err() {
    assert_tokens_error::<Example>(
        &error!([{
            ns: "deer",
            id: ["value", "missing"],
            properties: {
                "expected": u16::reflection(),
                "location": [{"type": "field", "value": "b"}]
            }
        },{
            ns: "deer",
            id: ["value", "missing"],
            properties: {
                "expected": u32::reflection(),
                "location": [{"type": "field", "value": "c"}]
            }
        },{
            ns: "deer",
            id: ["value", "missing"],
            properties: {
                "expected": ExampleFieldDiscriminator::reflection(),
                "location": []
            }
        },{
            ns: "deer",
            id: ["value", "missing"],
            properties: {
                "expected": ExampleFieldDiscriminator::reflection(),
                "location": []
            }
        }]),
        &[
            Token::Object { length: Some(1) },
            Token::Str("a"),
            Token::Number(2.into()),
            Token::ObjectEnd,
        ],
    );
}

#[test]
fn struct_object_too_many_err() {
    assert_tokens_error::<Example>(
        &error!([{
            ns: "deer",
            id: ["object", "length"],
            properties: {
                "expected": 3,
                "received": 4,
                "location": []
            }
        }]),
        &[
            Token::Object { length: Some(4) },
            Token::Str("a"),
            Token::Number(2.into()),
            Token::Str("b"),
            Token::Number(3.into()),
            Token::Str("c"),
            Token::Number(4.into()),
            Token::Str("d"),
            Token::Number(5.into()),
            Token::ObjectEnd,
        ],
    );
}

#[test]
#[ignore = "not yet implemented"]
fn struct_object_duplicate_err() {
    // for now we cannot test this because there's no error for us to use

    // this will fail (this is on purpose)
    assert_tokens_error::<Example>(
        &error!([{
            ns: "deer",
            id: ["object", "length"],
            properties: {
                "expected": 3,
                "received": 4,
                "location": []
            }
        }]),
        &[
            Token::Object { length: Some(3) },
            Token::Str("a"),
            Token::Number(2.into()),
            Token::Str("b"),
            Token::Number(3.into()),
            Token::Str("b"),
            Token::Number(4.into()),
            Token::ObjectEnd,
        ],
    );
}

#[test]
fn struct_array_ok() {
    assert_tokens(&Example { a: 2, b: 3, c: 4 }, &[
        Token::Array { length: Some(3) },
        Token::Number(2.into()),
        Token::Number(3.into()),
        Token::Number(4.into()),
        Token::ArrayEnd,
    ]);
}

#[test]
fn struct_array_missing_err() {
    assert_tokens_error::<Example>(
        &error!([{
            ns: "deer",
            id: ["value", "missing"],
            properties: {
                "expected": u32::reflection(),
                "location": [{"type": "tuple", "value": 2}]
            }
        }]),
        &[
            Token::Array { length: Some(2) },
            Token::Number(2.into()),
            Token::Number(3.into()),
            Token::ArrayEnd,
        ],
    );
}

#[test]
fn struct_array_too_many_err() {
    assert_tokens_error::<Example>(
        &error!([{
            ns: "deer",
            id: ["array", "length"],
            properties: {
                "expected": 3,
                "received": 4,
                "location": []
            }
        }]),
        &[
            Token::Array { length: Some(4) },
            Token::Number(2.into()),
            Token::Number(3.into()),
            Token::Number(4.into()),
            Token::Number(5.into()),
            Token::ArrayEnd,
        ],
    );
}
