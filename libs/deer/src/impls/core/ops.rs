use core::{marker::PhantomData, ops::Bound};

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        ArrayLengthError, DeserializeError, ExpectedField, ExpectedLength, ExpectedVariant,
        Location, ObjectAccessError, ReceivedField, ReceivedLength, ReceivedVariant,
        UnknownFieldError, UnknownVariantError, Variant, VisitorError,
    },
    impls::UnitVariantVisitor,
    schema::Reference,
    ArrayAccess, Deserialize, Deserializer, Document, EnumVisitor, ObjectAccess, Reflection,
    Schema, Visitor,
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
            BoundDiscriminant::Unbounded => deserializer
                .deserialize_optional(UnitVariantVisitor)
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

// TODO: Range, RangeFrom, RangeFull, RangeInclusive, RangeTo, RangeToInclusive

enum RangeIdent {
    Start,
    End,
}

impl Reflection for RangeIdent {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string").with("oneOf", ["start", "end"])
    }
}

impl<'de> Deserialize<'de> for RangeIdent {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        struct FieldVisitor;

        impl<'de> Visitor<'de> for FieldVisitor {
            type Value = RangeIdent;

            fn expecting(&self) -> Document {
                Self::Value::reflection()
            }

            fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
                match v {
                    "start" => Ok(RangeIdent::Start),
                    "end" => Ok(RangeIdent::End),
                    _ => Err(Report::new(UnknownFieldError.into_error())
                        .attach(ExpectedField::new("start"))
                        .attach(ExpectedField::new("end"))
                        .attach(ReceivedField::new(v))
                        .change_context(VisitorError)),
                }
            }

            fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
                match v {
                    b"start" => Ok(RangeIdent::Start),
                    b"end" => Ok(RangeIdent::End),
                    _ => {
                        let mut error = Report::new(UnknownFieldError.into_error())
                            .attach(ExpectedField::new("start"))
                            .attach(ExpectedField::new("end"));

                        if let Ok(received) = core::str::from_utf8(v) {
                            error = error.attach(ReceivedField::new(received));
                        }

                        Err(error.change_context(VisitorError))
                    }
                }
            }
        }

        de.deserialize_str(FieldVisitor)
            .change_context(DeserializeError)
    }
}

struct RangeVisitor<T, R: ?Sized>(PhantomData<fn() -> *const T>, PhantomData<fn() -> *const R>);

impl<'de, T, R> Visitor<'de> for RangeVisitor<T, R>
where
    T: Deserialize<'de>,
    R: Reflection + ?Sized,
{
    type Value = (T, T);

    fn expecting(&self) -> Document {
        R::document()
    }

    fn visit_array<A>(self, mut v: A) -> Result<Self::Value, VisitorError>
    where
        A: ArrayAccess<'de>,
    {
        v.set_bounded(2).change_context(VisitorError)?;

        let start = v.next().map_or_else(
            || {
                Err(Report::new(ArrayLengthError.into_error())
                    .attach(ExpectedLength::new(2))
                    .attach(ReceivedLength::new(0))
                    .change_context(VisitorError))
            },
            |value| {
                value
                    .attach(Location::Array(0))
                    .change_context(VisitorError)
            },
        );

        let end = v.next().map_or_else(
            || {
                Err(Report::new(ArrayLengthError.into_error())
                    .attach(ExpectedLength::new(2))
                    .attach(ReceivedLength::new(1))
                    .change_context(VisitorError))
            },
            |value| {
                value
                    .attach(Location::Array(1))
                    .change_context(VisitorError)
            },
        );

        let value = match (start, end) {
            (Ok(start), Ok(end)) => Ok((start, end)),
            (Ok(_), Err(error)) | (Err(error), Ok(_)) => Err(error),
            (Err(mut start), Err(end)) => {
                start.extend_one(end);

                Err(start)
            }
        };

        let end = v.end().change_context(VisitorError);

        match (value, end) {
            (Ok(start), Ok(_)) => Ok(start),
            (Err(error), Ok(_)) | (Ok(_), Err(error)) => Err(error),
            (Err(mut value), Err(end)) => {
                value.extend_one(end);

                Err(value)
            }
        }
    }

    fn visit_object<A>(self, mut v: A) -> Result<Self::Value, VisitorError>
    where
        A: ObjectAccess<'de>,
    {
        v.set_bounded(2).change_context(VisitorError)?;

        let mut start: Option<T> = None;
        let mut end: Option<T> = None;

        let mut errors: Result<(), ObjectAccessError> = Ok(());

        while let Some(field) = v.next::<RangeIdent, T>() {
            match field {
                Err(error) => match &mut errors {
                    Err(errors) => {
                        errors.extend_one(error);
                    }
                    errors => *errors = Err(error),
                },
                Ok((RangeIdent::Start, value)) => match &mut start {
                    Some(_) => {
                        let error = Report::new();

                        match &mut errors {
                            Err(errors) => {
                                errors.extend_one(error);
                            }
                            errors => *errors = Err(error),
                        }
                    }
                    start => *start = Some(value),
                },
                Ok((RangeIdent::End, value)) => match &mut end {
                    Some(_) => {
                        let error = Report::new();

                        match &mut errors {
                            Err(errors) => {
                                errors.extend_one(error);
                            }
                            errors => *errors = Err(error),
                        }
                    }
                    end => *end = Some(value),
                },
            }
        }

        if let Err(error) = v.end() {
            match &mut errors {
                Err(errors) => {
                    errors.extend_one(error);
                }
                errors => *errors = Err(error),
            }
        }

        // TODO: ensure that both values are there, this is only possible with (`TupleExt`)

        errors.change_context(VisitorError)?;

        todo!()
    }
}
