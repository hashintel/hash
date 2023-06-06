use core::{marker::PhantomData, ops::Bound};
use std::ops::{Range, RangeInclusive};

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        ArrayAccessError, ArrayLengthError, DeserializeError, DuplicateField, DuplicateFieldError,
        ExpectedField, ExpectedLength, ExpectedVariant, Location, ObjectAccessError, ReceivedField,
        ReceivedLength, ReceivedVariant, ResultExtPrivate, UnknownFieldError, UnknownVariantError,
        Variant, VisitorError,
    },
    ext::TupleExt,
    helpers::Properties,
    identifier,
    impls::UnitVariantVisitor,
    schema::Reference,
    value::NoneDeserializer,
    ArrayAccess, Deserialize, Deserializer, Document, EnumVisitor, FieldVisitor, ObjectAccess,
    Reflection, Schema, StructVisitor, Visitor,
};

identifier! {
    enum BoundDiscriminant {
        Unbounded = "Unbounded" | b"Unbounded" | 0,
        Included = "Included" | b"Included" | 1,
        Excluded = "Excluded" | b"Excluded" | 2,
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
            BoundDiscriminant::Unbounded => deserializer
                .deserialize_optional(UnitVariantVisitor)
                .map(|_| Bound::Unbounded)
                .attach(Location::Variant("Unbounded"))
                .change_context(VisitorError),
            BoundDiscriminant::Included => T::deserialize(deserializer)
                .map(Bound::Included)
                .attach(Location::Variant("Included"))
                .change_context(VisitorError),
            BoundDiscriminant::Excluded => T::deserialize(deserializer)
                .map(Bound::Excluded)
                .attach(Location::Variant("Excluded"))
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

identifier! {
    enum RangeIdent {
        Start = "start" | b"start" | 0,
        End = "end" | b"end" | 1,
    }
}

struct RangeFieldVisitor<'a, T> {
    start: &'a mut Option<T>,
    end: &'a mut Option<T>,
}

impl<'de, T> FieldVisitor<'de> for RangeFieldVisitor<'de, T>
where
    T: Deserialize<'de>,
{
    type Key = RangeIdent;
    type Value = ();

    fn visit_value<D>(self, key: Self::Key, deserializer: D) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>,
    {
        match key {
            RangeIdent::Start => {
                let value = T::deserialize(deserializer)
                    .attach(Location::Field("start"))
                    .change_context(VisitorError)?;

                if self.start.replace(value).is_some() {
                    return Err(Report::new(DuplicateFieldError.into_error())
                        .attach(DuplicateField::new("start"))
                        .change_context(VisitorError));
                }

                Ok(())
            }
            RangeIdent::End => {
                let value = T::deserialize(deserializer)
                    .attach(Location::Field("end"))
                    .change_context(VisitorError)?;

                if self.end.replace(value).is_some() {
                    return Err(Report::new(DuplicateFieldError.into_error())
                        .attach(DuplicateField::new("end"))
                        .change_context(VisitorError));
                }

                Ok(())
            }
        }
    }
}

struct RangeVisitor<T, R: ?Sized>(PhantomData<fn() -> *const T>, PhantomData<fn() -> *const R>);

impl<'de, T, R> StructVisitor<'de> for RangeVisitor<T, R>
where
    T: Deserialize<'de>,
    R: Reflection + ?Sized,
{
    type Value = (T, T);

    fn expecting(&self) -> Document {
        R::document()
    }

    fn visit_array<A>(self, array: A) -> Result<Self::Value, VisitorError>
    where
        A: ArrayAccess<'de>,
    {
        let mut array = array.into_bound(2).change_context(VisitorError)?;

        let start = array
            .next()
            .unwrap_or_else(|| {
                Deserialize::deserialize(NoneDeserializer::new(array.context()))
                    .attach(Location::Tuple(0))
                    .change_context(ArrayAccessError)
            })
            .attach(Location::Tuple(0));

        let end = array
            .next()
            .unwrap_or_else(|| {
                Deserialize::deserialize(NoneDeserializer::new(array.context()))
                    .attach(Location::Tuple(1))
                    .change_context(ArrayAccessError)
            })
            .attach(Location::Tuple(1));

        let (start, end, _) = (start, end, array.end())
            .fold_reports()
            .change_context(VisitorError)?;

        Ok((start, end))
    }

    fn visit_object<A>(self, mut object: A) -> Result<Self::Value, VisitorError>
    where
        A: ObjectAccess<'de>,
    {
        let mut start: Option<T> = None;
        let mut end: Option<T> = None;

        let mut errors: Result<(), ObjectAccessError> = Ok(());

        while let Some(field) = object.field(RangeFieldVisitor {
            start: &mut start,
            end: &mut end,
        }) {
            if let Err(error) = field {
                errors.extend_one(error);
            }
        }

        let start = start.map_or_else(
            || {
                Deserialize::deserialize(NoneDeserializer::new(object.context()))
                    .attach(Location::Field("start"))
                    .change_context(VisitorError)
            },
            Ok,
        );

        let end = end.map_or_else(
            || {
                Deserialize::deserialize(NoneDeserializer::new(object.context()))
                    .attach(Location::Field("end"))
                    .change_context(VisitorError)
            },
            Ok,
        );

        let (start, end, ..) = (
            start,
            end,
            errors.change_context(VisitorError),
            object.end().change_context(VisitorError),
        )
            .fold_reports()?;

        Ok((start, end))
    }
}

struct RangeReflection<T: ?Sized>(fn() -> *const T);

impl<T> Reflection for RangeReflection<T>
where
    T: Reflection + ?Sized,
{
    fn schema(doc: &mut Document) -> Schema {
        Schema::new("object").with(
            "properties",
            Properties([
                ("start", doc.add::<T>()), //
                ("end", doc.add::<T>()),
            ]),
        )
    }
}

impl<'de, T> Deserialize<'de> for Range<T>
where
    T: Deserialize<'de>,
{
    type Reflection = RangeReflection<T::Reflection>;

    fn deserialize<D>(deserializer: D) -> Result<Self, DeserializeError>
    where
        D: Deserializer<'de>,
    {
        deserializer
            .deserialize_struct(RangeVisitor::<T, Self::Reflection>(
                PhantomData,
                PhantomData,
            ))
            .map(|(start, end)| start..end)
            .change_context(DeserializeError)
    }
}

impl<'de, T> Deserialize<'de> for RangeInclusive<T>
where
    T: Deserialize<'de>,
{
    type Reflection = RangeReflection<T::Reflection>;

    fn deserialize<D>(deserializer: D) -> Result<Self, DeserializeError>
    where
        D: Deserializer<'de>,
    {
        deserializer
            .deserialize_struct(RangeVisitor::<T, Self::Reflection>(
                PhantomData,
                PhantomData,
            ))
            .map(|(start, end)| start..=end)
            .change_context(DeserializeError)
    }
}
