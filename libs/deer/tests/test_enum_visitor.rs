use deer::{
    error::{
        DeserializeError, ExpectedVariant, ReceivedVariant, UnknownVariantError, Variant,
        VisitorError,
    },
    Deserialize, Deserializer, Document, EnumVisitor, Reflection, Schema, Visitor,
};
use deer_desert::{assert_tokens, assert_tokens_error, error, Token};
use error_stack::{Report, Result, ResultExt};
use serde_json::json;

struct DiscriminantVisitor;

impl<'de> Visitor<'de> for DiscriminantVisitor {
    type Value = Discriminant;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    // usually we'd also check for bytes, but meh :shrug:
    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
        match v {
            "Variant" => Ok(Discriminant::Variant),
            _ => Err(Report::new(UnknownVariantError.into_error())
                .attach(ExpectedVariant::new("Variant"))
                .attach(ReceivedVariant::new(v))
                .change_context(VisitorError)),
        }
    }
}

enum Discriminant {
    Variant,
}

impl Reflection for Discriminant {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string").with("enum", ["Variant"])
    }
}

impl<'de> Deserialize<'de> for Discriminant {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_str(DiscriminantVisitor)
            .change_context(DeserializeError)
    }
}

struct UnitEnumVisitor;

impl<'de> EnumVisitor<'de> for UnitEnumVisitor {
    type Discriminant = Discriminant;
    type Value = UnitEnum;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_value<D>(
        self,
        discriminant: Self::Discriminant,
        _: D,
    ) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>,
    {
        match discriminant {
            Discriminant::Variant => Ok(UnitEnum::Variant),
        }
    }
}

#[derive(Debug, PartialEq)]
enum UnitEnum {
    Variant,
}

impl<'de> Deserialize<'de> for UnitEnum {
    type Reflection = Discriminant;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_enum(UnitEnumVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn unit_variant() {
    assert_tokens(&UnitEnum::Variant, &[Token::String("Variant")]);

    assert_tokens_error::<UnitEnum>(
        &error!([
            {
                ns: "deer",
                id: ["type"],
                properties: {
                    "expected": null,
                    "location": [],
                    "received": null
                }
            }
        ]),
        &[
            Token::Object { length: Some(1) },
            Token::String("Variant"),
            Token::Bool(true),
            Token::ObjectEnd,
        ],
    )
}

struct NewtypeEnumVisitor;

impl<'de> EnumVisitor<'de> for NewtypeEnumVisitor {
    type Discriminant = Discriminant;
    type Value = NewtypeEnum;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_value<D>(
        self,
        discriminant: Self::Discriminant,
        deserializer: D,
    ) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>,
    {
        match discriminant {
            Discriminant::Variant => u8::deserialize(deserializer)
                .map(NewtypeEnum::Variant)
                .change_context(VisitorError),
        }
    }
}

#[derive(Debug, PartialEq)]
enum NewtypeEnum {
    Variant(u8),
}

impl<'de> Deserialize<'de> for NewtypeEnum {
    // TODO: this is wrong
    type Reflection = Discriminant;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_enum(NewtypeEnumVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn newtype_variant() {
    assert_tokens(&NewtypeEnum::Variant(12), &[
        Token::Object { length: Some(1) },
        Token::String("Variant"),
        Token::Number(12u8.into()),
        Token::ObjectEnd,
    ]);

    assert_tokens_error::<NewtypeEnum>(
        &error!([
            {
                ns: "deer",
                id: ["value", "missing"],
                properties: {
                    "expected": u8::reflection(),
                    "location": [],
                }
            }
        ]),
        &[Token::String("Variant")],
    )
}

enum StructEnum {
    Variant { id: String },
}

#[test]
fn struct_variant() {}

#[repr(u8)]
enum DiscriminatorEnum {
    Variant = 1,
}

#[test]
fn discriminator_variant() {}

// TODO: complex

enum InternallyTaggedMessage {
    Request {
        id: String,
        method: String,
        params: u8,
    },
    Response {
        id: String,
        result: u64,
    },
}

#[test]
fn internally_tagged() {}

enum AdjacentlyTaggedMessage {
    Request {
        id: String,
        method: String,
        params: u8,
    },
    Response {
        id: String,
        result: u64,
    },
}

#[test]
fn adjacently_tagged() {}

enum UntaggedMessage {
    Request {
        id: String,
        method: String,
        params: u8,
    },
    Response {
        id: String,
        result: u64,
    },
}

#[test]
fn untagged() {}
