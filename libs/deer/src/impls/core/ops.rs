use core::{marker::PhantomData, ops::Bound};

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        DeserializeError, ExpectedVariant, Location, ReceivedVariant, UnknownVariantError, Variant,
        VisitorError,
    },
    schema::Reference,
    Deserialize, Deserializer, Document, EnumVisitor, FieldVisitor, Reflection, Schema, Visitor,
};

enum BoundDiscriminant {
    Included,
    Excluded,
    Unbounded,
}

impl Reflection for BoundDiscriminant {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string").with("enum", ["Included", "Excluded", "Unbounded"])
    }
}

struct BoundDiscriminantVisitor;

impl<'de> Visitor<'de> for BoundDiscriminantVisitor {
    type Value = BoundDiscriminant;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
        match v {
            "Included" => Ok(BoundDiscriminant::Included),
            "Excluded" => Ok(BoundDiscriminant::Excluded),
            "Unbounded" => Ok(BoundDiscriminant::Unbounded),
            _ => Err(Report::new(UnknownVariantError.into_error())
                .attach(ExpectedVariant::new("Included"))
                .attach(ExpectedVariant::new("Excluded"))
                .attach(ExpectedVariant::new("Unbounded"))
                .attach(ReceivedVariant::new(v))
                .change_context(VisitorError)),
        }
    }

    fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
        match v {
            b"Included" => Ok(BoundDiscriminant::Included),
            b"Excluded" => Ok(BoundDiscriminant::Excluded),
            b"Unbounded" => Ok(BoundDiscriminant::Unbounded),
            _ => {
                let mut error = Report::new(UnknownVariantError.into_error())
                    .attach(ExpectedVariant::new("Included"))
                    .attach(ExpectedVariant::new("Excluded"))
                    .attach(ExpectedVariant::new("Unbounded"));

                if let Ok(received) = core::str::from_utf8(v) {
                    error = error.attach(ReceivedVariant::new(received));
                }

                Err(error.change_context(VisitorError))
            }
        }
    }
}

impl<'de> Deserialize<'de> for BoundDiscriminant {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_str(BoundDiscriminantVisitor)
            .change_context(DeserializeError)
    }
}

struct BoundEnumVisitor<T>(PhantomData<fn() -> *const T>);

impl<'de, T> EnumVisitor<'de> for BoundEnumVisitor<T>
where
    T: Deserialize<'de>,
{
    type Discriminant = BoundDiscriminant;
    type Value = Bound<T>;

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
            BoundDiscriminant::Included => T::deserialize(deserializer)
                .map(Bound::Included)
                .attach(Location::Variant("Included"))
                .change_context(VisitorError),
            BoundDiscriminant::Excluded => T::deserialize(deserializer)
                .map(Bound::Excluded)
                .attach(Location::Variant("Excluded"))
                .change_context(VisitorError),
            // unit variant, we need to make sure it is not there or null (or unit)
            // deserializing Option<()> is perfect, we don't care about the end result
            // just that it passed.
            BoundDiscriminant::Unbounded => Option::<()>::deserialize(deserializer)
                .map(|_| Bound::Unbounded)
                .attach(Location::Variant("Unbounded"))
                .change_context(VisitorError),
        }
    }
}

pub struct BoundReflection<T: ?Sized>(fn() -> *const T);

impl<T> Reflection for BoundReflection<T>
where
    T: Reflection + ?Sized,
{
    fn schema(doc: &mut Document) -> Schema {
        #[derive(serde::Serialize)]
        enum BoundOneOf {
            Included(Reference),
            Excluded(Reference),
            Unbounded(Reference),
        }

        // TODO: the case where "Unbounded" as a single value is possible cannot be
        //  represented right now with deer Schema capabilities
        Schema::new("object").with("oneOf", [
            BoundOneOf::Included(doc.add::<T>()),
            BoundOneOf::Excluded(doc.add::<T>()),
            BoundOneOf::Unbounded(doc.add::<<() as Deserialize>::Reflection>()),
        ])
    }
}

impl<'de, T> Deserialize<'de> for Bound<T>
where
    T: Deserialize<'de>,
{
    type Reflection = BoundReflection<T::Reflection>;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_enum(BoundEnumVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
