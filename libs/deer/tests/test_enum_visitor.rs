use deer::{
    Deserialize, Deserializer, Document, EnumVisitor, FieldVisitor, ObjectAccess, Reflection,
    Schema, Visitor,
    error::{
        DeserializeError, ExpectedLength, ExpectedType, ExpectedVariant, Location, MissingError,
        ObjectLengthError, ReceivedLength, ReceivedVariant, UnknownVariantError, Variant as _,
        VisitorError,
    },
    helpers::ExpectNone,
    schema::Reference,
};
use deer_desert::{Token, assert_tokens, assert_tokens_error, error};
use error_stack::{Report, ReportSink, ResultExt as _};
use serde::{Serializer, ser::SerializeMap as _};
use serde_json::json;

struct DiscriminantVisitor;

impl Visitor<'_> for DiscriminantVisitor {
    type Value = Discriminant;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    // usually we'd also check for bytes, but meh :shrug:
    fn visit_str(self, value: &str) -> Result<Self::Value, Report<VisitorError>> {
        match value {
            "Variant" => Ok(Discriminant::Variant),
            _ => Err(Report::new(UnknownVariantError.into_error())
                .attach(ExpectedVariant::new("Variant"))
                .attach(ReceivedVariant::new(value))
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

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_str(DiscriminantVisitor)
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
        deserializer: D,
    ) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        // TODO: next PR properly addresses this via `ExpectNone`
        match discriminant {
            Discriminant::Variant => ExpectNone::deserialize(deserializer)
                .map(|_| UnitEnum::Variant)
                .change_context(VisitorError),
        }
    }
}

#[derive(Debug, PartialEq)]
enum UnitEnum {
    Variant,
}

impl<'de> Deserialize<'de> for UnitEnum {
    type Reflection = Discriminant;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_enum(UnitEnumVisitor)
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
                    "received": bool::reflection()
                }
            }
        ]),
        &[
            Token::Object { length: Some(1) },
            Token::String("Variant"),
            Token::Bool(true),
            Token::ObjectEnd,
        ],
    );
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
    ) -> Result<Self::Value, Report<VisitorError>>
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

impl Reflection for NewtypeEnum {
    fn schema(doc: &mut Document) -> Schema {
        struct Properties<T>(T);

        impl<T: serde::Serialize> serde::Serialize for Properties<T> {
            fn serialize<S>(&self, serializer: S) -> core::result::Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry(&"properties", &self.0)?;
                map.end()
            }
        }

        #[derive(serde::Serialize)]
        enum NewtypeEnumVariants {
            Variant(Reference),
        }

        Schema::new("object").with(
            "oneOf",
            [Properties(NewtypeEnumVariants::Variant(doc.add::<u8>()))],
        )
    }
}

impl<'de> Deserialize<'de> for NewtypeEnum {
    // TODO: this is wrong
    type Reflection = Discriminant;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_enum(NewtypeEnumVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn newtype_variant() {
    assert_tokens(
        &NewtypeEnum::Variant(12),
        &[
            Token::Object { length: Some(1) },
            Token::String("Variant"),
            Token::Number(12_u8.into()),
            Token::ObjectEnd,
        ],
    );

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
    );
}

#[derive(Debug, PartialEq)]
enum StructEnum {
    Variant { id: u8 },
}

struct StructEnumVariant;

impl Reflection for StructEnumVariant {
    fn schema(doc: &mut Document) -> Schema {
        #[derive(serde::Serialize)]
        struct StructEnumVariantProperties {
            id: Reference,
        }

        Schema::new("object").with(
            "properties",
            StructEnumVariantProperties {
                id: doc.add::<u8>(),
            },
        )
    }
}

impl Reflection for StructEnum {
    fn schema(doc: &mut Document) -> Schema {
        #[derive(serde::Serialize)]
        enum Variants {
            Variant(Reference),
        }

        struct Properties<T>(T);

        impl<T: serde::Serialize> serde::Serialize for Properties<T> {
            fn serialize<S>(&self, serializer: S) -> core::result::Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry(&"properties", &self.0)?;
                map.end()
            }
        }

        Schema::new("object")
            .with(
                "oneOf",
                [Properties(Variants::Variant(
                    doc.add::<StructEnumVariant>(),
                ))],
            )
            .with("additionalProperties", false)
    }
}

struct StructEnumVisitor {
    field: Discriminant,
}

impl<'de> Visitor<'de> for StructEnumVisitor {
    type Value = StructEnum;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_object<A>(self, object: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ObjectAccess<'de>,
    {
        match self.field {
            Discriminant::Variant => {
                // TODO: there should be a macro that does this all already...
                struct VariantFieldVisitor;

                enum VariantFieldIdent {
                    Id,
                }
                impl Reflection for VariantFieldIdent {
                    fn schema(_: &mut Document) -> Schema {
                        Schema::new("string").with("enum", ["id"])
                    }
                }

                enum VariantField {
                    Id(u8),
                }

                impl Visitor<'_> for VariantFieldVisitor {
                    type Value = VariantFieldIdent;

                    fn expecting(&self) -> Document {
                        Self::Value::reflection()
                    }

                    fn visit_str(self, value: &str) -> Result<Self::Value, Report<VisitorError>> {
                        match value {
                            "id" => Ok(VariantFieldIdent::Id),
                            _ => Err(Report::new(UnknownVariantError.into_error())
                                .attach(ExpectedVariant::new("id"))
                                .change_context(VisitorError)),
                        }
                    }

                    // for simplicities sake visit_bytes has been omitted
                }

                impl<'de> Deserialize<'de> for VariantFieldIdent {
                    type Reflection = Self;

                    fn deserialize<D: Deserializer<'de>>(
                        deserializer: D,
                    ) -> Result<Self, Report<DeserializeError>> {
                        deserializer
                            .deserialize_str(VariantFieldVisitor)
                            .change_context(DeserializeError)
                    }
                }

                struct VariantFieldAccess;

                impl<'de> FieldVisitor<'de> for VariantFieldAccess {
                    type Key = VariantFieldIdent;
                    type Value = VariantField;

                    fn visit_value<D>(
                        self,
                        key: Self::Key,
                        deserializer: D,
                    ) -> Result<Self::Value, Report<VisitorError>>
                    where
                        D: Deserializer<'de>,
                    {
                        match key {
                            VariantFieldIdent::Id => u8::deserialize(deserializer)
                                .map(VariantField::Id)
                                .change_context(VisitorError),
                        }
                    }
                }

                let mut object = object.into_bound(1).change_context(VisitorError)?;

                let mut id = None;
                let mut errors = ReportSink::new();

                match object.field(VariantFieldAccess) {
                    None => {
                        // not enough items
                        let error = Report::new(ObjectLengthError.into_error())
                            .attach(ReceivedLength::new(0))
                            .attach(ExpectedLength::new(1))
                            .change_context(VisitorError);

                        errors.append(error);
                    }
                    Some(Ok(VariantField::Id(value))) => id = Some(value),
                    Some(Err(error)) => {
                        errors.append(error.change_context(VisitorError));
                    }
                }

                if id.is_none() {
                    let error = Report::new(MissingError.into_error())
                        .attach(Location::Field("id"))
                        .attach(ExpectedType::new(u8::reflection()));

                    errors.append(error.change_context(VisitorError));
                }

                errors.finish().change_context(VisitorError)?;

                object.end().change_context(VisitorError)?;

                Ok(StructEnum::Variant {
                    id: id.expect("should be infallible"),
                })
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
    ) -> Result<Self::Value, Report<VisitorError>>
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
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_enum(StructEnumIdentVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn struct_variant() {
    assert_tokens(
        &StructEnum::Variant { id: 12 },
        &[
            Token::Object { length: Some(1) },
            Token::String("Variant"),
            Token::Object { length: Some(1) },
            Token::String("id"),
            Token::Number(12_u8.into()),
            Token::ObjectEnd,
            Token::ObjectEnd,
        ],
    );

    assert_tokens_error::<StructEnum>(
        &error!([
            {
                ns: "deer",
                id: ["value", "missing"],
                properties: {
                    "expected": StructEnum::reflection(),
                    "location": [],
                }
            }
        ]),
        &[Token::String("Variant")],
    );
}

#[expect(unused)]
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
    unimplemented!()
}

#[expect(unused)]
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
    unimplemented!()
}

#[expect(unused)]
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
    unimplemented!()
}
