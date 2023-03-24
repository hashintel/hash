use deer::{
    error::{
        DeserializeError, ExpectedLength, ExpectedVariant, FieldAccessError, ObjectLengthError,
        ReceivedLength, ReceivedVariant, UnknownVariantError, ValueError, Variant, VisitorError,
    },
    Deserialize, Deserializer, Document, EnumVisitor, FieldAccess, ObjectAccess, Reflection,
    Schema, Visitor,
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

#[derive(Debug, PartialEq)]
enum StructEnum {
    Variant { id: u8 },
}

struct StructEnumVisitor {
    field: Discriminant,
}

impl<'de> Visitor<'de> for StructEnumVisitor {
    type Value = StructEnum;

    fn expecting(&self) -> Document {
        // TODO: this is the wrong reflection
        Discriminant::reflection()
    }

    fn visit_object<T>(self, mut v: T) -> Result<Self::Value, VisitorError>
    where
        T: ObjectAccess<'de>,
    {
        match self.field {
            Discriminant::Variant => {
                // TODO: there should be a macro that does this all already...
                struct VariantFieldVisitor;

                enum VariantFieldIdent {
                    Id,
                }

                enum VariantField {
                    Id(u8),
                }

                impl<'de> Visitor<'de> for VariantFieldVisitor {
                    type Value = VariantFieldIdent;

                    fn expecting(&self) -> Document {
                        Self::Value::reflection()
                    }

                    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
                        match v {
                            "id" => Ok(VariantFieldIdent::Id),
                            _ => Err(Report::new(UnknownVariantError.into_error())
                                .attach(ExpectedVariant::new("id"))
                                .change_context(VisitorError)),
                        }
                    }

                    // for simplicities sake visit_bytes has been omitted
                }

                impl<'de> Deserialize<'de> for VariantFieldIdent {
                    // TODO: not correct reflection
                    type Reflection = Discriminant;

                    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
                        de.deserialize_str(VariantFieldVisitor)
                            .change_context(DeserializeError)
                    }
                }

                struct VariantFieldAccess;

                impl<'de> FieldAccess<'de> for VariantFieldAccess {
                    type Key = VariantFieldIdent;
                    type Value = VariantField;

                    fn value<D>(
                        self,
                        key: Self::Key,
                        deserializer: D,
                    ) -> Result<Self::Value, FieldAccessError>
                    where
                        D: Deserializer<'de>,
                    {
                        match key {
                            VariantFieldIdent::Id => u8::deserialize(deserializer)
                                .map(VariantField::Id)
                                .change_context(FieldAccessError),
                        }
                    }
                }

                v.set_bounded(1).change_context(VisitorError)?;

                let mut id = None;
                let mut errors: Result<(), VisitorError> = Ok(());

                match v.field(VariantFieldAccess) {
                    None => {
                        // not enough items
                        let error = Report::new(ObjectLengthError.into_error())
                            .attach(ReceivedLength::new(0))
                            .attach(ExpectedLength::new(1))
                            .change_context(VisitorError);

                        match &mut errors {
                            Ok(_) => errors = Err(error),
                            Err(errors) => errors.extend_one(error),
                        }
                    }
                    Some(Ok(VariantField::Id(value))) => id = Some(value),
                    Some(Err(error)) => match &mut errors {
                        Ok(_) => errors = Err(error.change_context(VisitorError)),
                        Err(errors) => errors.extend_one(error.change_context(VisitorError)),
                    },
                }

                v.end().change_context(VisitorError)?;

                Ok(StructEnum::Variant { id: id.unwrap() })
            }
        }
    }
}

struct StructEnumIdentVisitor;

impl<'de> EnumVisitor<'de> for StructEnumIdentVisitor {
    type Discriminant = Discriminant;
    type Value = StructEnum;

    fn expecting(&self) -> Document {
        Discriminant::document()
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
            Discriminant::Variant => deserializer
                .deserialize_object(StructEnumVisitor {
                    field: Discriminant::Variant,
                })
                .change_context(VisitorError),
        }
    }
}

impl<'de> Deserialize<'de> for StructEnum {
    // TODO: not the right reflection
    type Reflection = Discriminant;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_enum(StructEnumIdentVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn struct_variant() {
    assert_tokens(&StructEnum::Variant { id: 12 }, &[
        Token::Object { length: Some(1) },
        Token::String("Variant"),
        Token::Object { length: Some(1) },
        Token::String("id"),
        Token::Number(12u8.into()),
        Token::ObjectEnd,
        Token::ObjectEnd,
    ]);

    assert_tokens_error::<StructEnum>(
        &error!([
            {
                ns: "deer",
                id: ["value", "missing"],
                properties: {
                    "expected": Discriminant::reflection(),
                    "location": [],
                }
            }
        ]),
        &[Token::String("Variant")],
    )
}

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
#[ignore = "requires `Value<'de>` / `Content<'de>` variant"]
fn internally_tagged() {
    todo!()
}

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
#[ignore = "requires `Value<'de>` / `Content<'de>` if the tag is not first"]
fn adjacently_tagged() {
    todo!()
}

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
#[ignore = "required `Value<'de>` / `Content<'de>`"]
fn untagged() {
    todo!()
}
