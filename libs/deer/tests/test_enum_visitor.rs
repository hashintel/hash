use deer::{
    error::{
        DeserializeError, ExpectedVariant, ReceivedVariant, UnknownVariantError, Variant,
        VisitorError,
    },
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};
use deer_desert::{assert_tokens, assert_tokens_error, error, Token};
use error_stack::{Report, Result, ResultExt};

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

#[derive(Debug)]
enum UnitEnum {
    Variant,
}

#[test]
fn unit_variant() {
    assert_tokens(&UnitEnum::Variant, &[Token::String("Variant")]);
    assert_tokens_error::<UnitEnum>(
        &error!([
            {
                "ns": "deer",
                "id": ["type"]
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

enum NewtypeEnum {
    Variant(u8),
}

#[test]
fn newtype_variant() {}

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
