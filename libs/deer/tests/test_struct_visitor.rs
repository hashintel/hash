#![expect(clippy::min_ident_chars, reason = "Simplifies test cases")]

use deer::{
    ArrayAccess, Deserialize, Deserializer, Document, FieldVisitor, ObjectAccess, Reflection,
    Schema, StructVisitor, Visitor,
    error::{ArrayAccessError, DeserializeError, Variant as _, VisitorError},
};
use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};
use serde_json::json;

mod common;

use deer::{
    error::{ExpectedField, Location, ObjectAccessError, ReceivedField, UnknownFieldError},
    helpers::Properties,
    value::NoneDeserializer,
};
use deer_desert::{Token, assert_tokens, assert_tokens_error, error};

#[derive(Debug, Eq, PartialEq)]
struct Example {
    a: u8,
    b: u16,
    c: u32,
}

struct ExampleFieldVisitor<'a> {
    a: &'a mut Option<u8>,
    b: &'a mut Option<u16>,
    c: &'a mut Option<u32>,
}

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

    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
    where
        D: Deserializer<'de>,
    {
        struct IdentVisitor;

        impl Visitor<'_> for IdentVisitor {
            type Value = ExampleFieldDiscriminator;

            fn expecting(&self) -> Document {
                Self::Value::reflection()
            }

            fn visit_str(self, value: &str) -> Result<Self::Value, Report<VisitorError>> {
                match value {
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

            fn visit_bytes(self, value: &[u8]) -> Result<Self::Value, Report<VisitorError>> {
                match value {
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

            fn visit_u64(self, value: u64) -> Result<Self::Value, Report<VisitorError>> {
                match value {
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

impl<'de> FieldVisitor<'de> for ExampleFieldVisitor<'_> {
    type Key = ExampleFieldDiscriminator;
    type Value = ();

    fn visit_value<D>(
        self,
        key: Self::Key,
        deserializer: D,
    ) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        // doing this instead of using an enum as return value resolves the issue that the enum
        // would take always take the size of the biggest element in the enum itself,
        // which is not ideal.
        match key {
            ExampleFieldDiscriminator::A => {
                let value = u8::deserialize(deserializer)
                    .attach(Location::Field("a"))
                    .change_context(VisitorError)?;

                match self.a {
                    Some(_) => unimplemented!("planned in follow up PR"),
                    other => *other = Some(value),
                }

                Ok(())
            }
            ExampleFieldDiscriminator::B => {
                let value = u16::deserialize(deserializer)
                    .attach(Location::Field("b"))
                    .change_context(VisitorError)?;

                match self.b {
                    Some(_) => unimplemented!("planned in follow up PR"),
                    other => *other = Some(value),
                }

                Ok(())
            }
            ExampleFieldDiscriminator::C => {
                let value = u32::deserialize(deserializer)
                    .attach(Location::Field("c"))
                    .change_context(VisitorError)?;

                match self.c {
                    Some(_) => unimplemented!("panned in follow up PR"),
                    other => *other = Some(value),
                }

                Ok(())
            }
        }
    }
}

struct ExampleVisitor;

impl<'de> StructVisitor<'de> for ExampleVisitor {
    type Value = Example;

    fn expecting(&self) -> Document {
        Example::reflection()
    }

    fn visit_array<A>(self, array: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ArrayAccess<'de>,
    {
        let mut array = array.into_bound(3).change_context(VisitorError)?;

        // while the contract states that we're guaranteed to always `Some` for the first 3
        // due to set_bounded we make sure that even if implementations are not correct we are still
        // correct but doing `unwrap_or_else`.
        // TODO: we might be able to expose that through the type system?
        // TODO: instead of doing this we need to use `NoneDeserializer`,
        //       this needs `.context()` on access rules to ensure proper ownership
        let a = array
            .next()
            .unwrap_or_else(|| {
                Deserialize::deserialize(NoneDeserializer::new(array.context()))
                    .attach(Location::Tuple(0))
                    .change_context(ArrayAccessError)
            })
            .attach(Location::Tuple(0));

        let b = array
            .next()
            .unwrap_or_else(|| {
                Deserialize::deserialize(NoneDeserializer::new(array.context()))
                    .attach(Location::Tuple(1))
                    .change_context(ArrayAccessError)
            })
            .attach(Location::Tuple(1));

        let c = array
            .next()
            .unwrap_or_else(|| {
                Deserialize::deserialize(NoneDeserializer::new(array.context()))
                    .attach(Location::Tuple(2))
                    .change_context(ArrayAccessError)
            })
            .attach(Location::Tuple(2));

        let (a, b, c, ()) = (a, b, c, array.end())
            .try_collect()
            .change_context(VisitorError)?;

        Ok(Example { a, b, c })
    }

    fn visit_object<A>(self, mut object: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ObjectAccess<'de>,
    {
        let mut a = None;
        let mut b = None;
        let mut c = None;

        let mut errors = ReportSink::new();

        while let Some(field) = object.field(ExampleFieldVisitor {
            a: &mut a,
            b: &mut b,
            c: &mut c,
        }) {
            if let Err(error) = field {
                errors.append(error);
            }
        }

        let a = a.map_or_else(
            || {
                Deserialize::deserialize(NoneDeserializer::new(object.context()))
                    .attach(Location::Field("a"))
                    .change_context(ObjectAccessError)
            },
            Ok,
        );

        let b = b.map_or_else(
            || {
                Deserialize::deserialize(NoneDeserializer::new(object.context()))
                    .attach(Location::Field("b"))
                    .change_context(ObjectAccessError)
            },
            Ok,
        );

        let c = c.map_or_else(
            || {
                Deserialize::deserialize(NoneDeserializer::new(object.context()))
                    .attach(Location::Field("c"))
                    .change_context(ObjectAccessError)
            },
            Ok,
        );

        let (a, b, c, ..) = (a, b, c, errors.finish(), object.end())
            .try_collect()
            .change_context(VisitorError)?;

        Ok(Example { a, b, c })
    }
}

impl Reflection for Example {
    fn schema(doc: &mut Document) -> Schema {
        // TODO: we cannot express or constraints right now
        //       we would need to say: object if e.g. JSON-schema, other format might do both
        //       blueprint must support "struct"
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

    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
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
    assert_tokens(
        &Example { a: 2, b: 3, c: 4 },
        &[
            Token::Object { length: Some(3) },
            Token::Str("a"),
            Token::Number(2.into()),
            Token::Str("b"),
            Token::Number(3.into()),
            Token::Str("c"),
            Token::Number(4.into()),
            Token::ObjectEnd,
        ],
    );
}

#[test]
fn struct_object_out_of_order_ok() {
    assert_tokens(
        &Example { a: 2, b: 3, c: 4 },
        &[
            Token::Object { length: Some(3) },
            Token::Str("c"),
            Token::Number(4.into()),
            Token::Str("b"),
            Token::Number(3.into()),
            Token::Str("a"),
            Token::Number(2.into()),
            Token::ObjectEnd,
        ],
    );
}

// TODO: key missing instead of value missing (or discriminant missing) ~> only possible with
//       IdentifierVisitor?
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
            id: ["unknown", "field"],
            properties: {
                "expected": ["a", "b", "c"],
                "received": ["d"],
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
            id: ["unknown", "field"],
            properties: {
                "expected": ["a", "b", "c"],
                "received": ["d"],
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
    assert_tokens(
        &Example { a: 2, b: 3, c: 4 },
        &[
            Token::Array { length: Some(3) },
            Token::Number(2.into()),
            Token::Number(3.into()),
            Token::Number(4.into()),
            Token::ArrayEnd,
        ],
    );
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
