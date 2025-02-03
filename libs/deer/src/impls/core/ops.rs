use core::{
    marker::PhantomData,
    ops::{Bound, Range, RangeFrom, RangeFull, RangeInclusive, RangeTo, RangeToInclusive},
};

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use crate::{
    ArrayAccess, Deserialize, Deserializer, Document, EnumVisitor, FieldVisitor, ObjectAccess,
    Reflection, Schema, StructVisitor,
    error::{
        ArrayAccessError, DeserializeError, DuplicateField, DuplicateFieldError, Location,
        Variant as _, VisitorError,
    },
    helpers::Properties,
    identifier,
    impls::UnitVariantVisitor,
    schema::Reference,
    value::NoneDeserializer,
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
    ) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        match discriminant {
            BoundDiscriminant::Unbounded => deserializer
                .deserialize_optional(UnitVariantVisitor)
                .map(|()| Bound::Unbounded)
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

pub struct BoundReflection<T: ?Sized>(#[expect(dead_code)] fn() -> *const T);

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
        Schema::new("object").with(
            "oneOf",
            [
                BoundOneOf::Included(doc.add::<T>()),
                BoundOneOf::Excluded(doc.add::<T>()),
                BoundOneOf::Unbounded(doc.add::<<() as Deserialize>::Reflection>()),
            ],
        )
    }
}

impl<'de, T> Deserialize<'de> for Bound<T>
where
    T: Deserialize<'de>,
{
    type Reflection = BoundReflection<T::Reflection>;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_enum(BoundEnumVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}

identifier! {
    enum RangeIdent {
        Start = "start" | b"start" | 0,
        End = "end" | b"end" | 1,
    }
}

struct RangeFieldVisitor<'a, T, U> {
    start: &'a mut Option<T>,
    end: &'a mut Option<U>,
}

impl<'de, T, U> FieldVisitor<'de> for RangeFieldVisitor<'_, T, U>
where
    T: Deserialize<'de>,
    U: Deserialize<'de>,
{
    type Key = RangeIdent;
    type Value = ();

    fn visit_value<D>(
        self,
        key: Self::Key,
        deserializer: D,
    ) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        match key {
            RangeIdent::Start => {
                let value = T::deserialize(deserializer)
                    .attach(Location::Field("start"))
                    .change_context(VisitorError)?;

                if self.start.is_some() {
                    return Err(Report::new(DuplicateFieldError.into_error())
                        .attach(DuplicateField::new("start"))
                        .change_context(VisitorError));
                }

                *self.start = Some(value);

                Ok(())
            }
            RangeIdent::End => {
                let value = U::deserialize(deserializer)
                    .attach(Location::Field("end"))
                    .change_context(VisitorError)?;

                if self.end.is_some() {
                    return Err(Report::new(DuplicateFieldError.into_error())
                        .attach(DuplicateField::new("end"))
                        .change_context(VisitorError));
                }

                *self.end = Some(value);

                Ok(())
            }
        }
    }
}

struct RangeVisitor<T, U, R: ?Sized>(
    PhantomData<fn() -> *const (T, U)>,
    PhantomData<fn() -> *const R>,
);

impl<'de, T, U, R> StructVisitor<'de> for RangeVisitor<T, U, R>
where
    T: Deserialize<'de>,
    U: Deserialize<'de>,
    R: Reflection + ?Sized,
{
    type Value = (T, U);

    fn expecting(&self) -> Document {
        R::document()
    }

    fn visit_array<A>(self, array: A) -> Result<Self::Value, Report<VisitorError>>
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

        let (start, end, ()) = (start, end, array.end())
            .try_collect()
            .change_context(VisitorError)?;

        Ok((start, end))
    }

    fn visit_object<A>(self, mut object: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ObjectAccess<'de>,
    {
        let mut start: Option<T> = None;
        let mut end: Option<U> = None;

        let mut errors = ReportSink::new();

        while let Some(field) = object.field(RangeFieldVisitor {
            start: &mut start,
            end: &mut end,
        }) {
            if let Err(error) = field {
                errors.append(error);
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
            errors.finish().change_context(VisitorError),
            object.end().change_context(VisitorError),
        )
            .try_collect()
            .change_context(VisitorError)?;

        Ok((start, end))
    }
}

pub struct RangeReflection<T: ?Sized, U: ?Sized>(
    #[expect(dead_code)] fn() -> *const T,
    #[expect(dead_code)] fn() -> *const U,
);

impl<T, U> Reflection for RangeReflection<T, U>
where
    T: Reflection + ?Sized,
    U: Reflection + ?Sized,
{
    fn schema(doc: &mut Document) -> Schema {
        Schema::new("object").with(
            "properties",
            Properties([("start", doc.add::<T>()), ("end", doc.add::<U>())]),
        )
    }
}

impl<'de, T> Deserialize<'de> for Range<T>
where
    T: Deserialize<'de>,
{
    type Reflection = RangeReflection<T::Reflection, T::Reflection>;

    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
    where
        D: Deserializer<'de>,
    {
        deserializer
            .deserialize_struct(RangeVisitor::<T, T, Self::Reflection>(
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
    type Reflection = RangeReflection<T::Reflection, T::Reflection>;

    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
    where
        D: Deserializer<'de>,
    {
        deserializer
            .deserialize_struct(RangeVisitor::<T, T, Self::Reflection>(
                PhantomData,
                PhantomData,
            ))
            .map(|(start, end)| start..=end)
            .change_context(DeserializeError)
    }
}

// We follow the same deserialization rules as serde, but we also implement `Range` for all types
// This means we need to adapt the existing `Range` deserialization rules to our own
// RangeFrom: {"start": T, "end": null} => RangeFrom { start: T }
// RangeTo: {"start": null, "end": T} => RangeTo { end: T }
// RangeToInclusive: {"start": null, "end": T} => RangeToInclusive { end: T }
// RangeFull: {"start": null, "end": null} => RangeFull
// on an object the keys are optional and on arrays the end can be omitted if it is always null

impl<'de, T> Deserialize<'de> for RangeFrom<T>
where
    T: Deserialize<'de>,
{
    type Reflection = RangeReflection<T::Reflection, <Option<()> as Deserialize<'de>>::Reflection>;

    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
    where
        D: Deserializer<'de>,
    {
        // `Option<()>` allows us to deserialize `null` and(!) `none`, `ExpectNone` only allows
        // `none`, `()` only allows `null`
        deserializer
            .deserialize_struct(RangeVisitor::<T, Option<()>, Self::Reflection>(
                PhantomData,
                PhantomData,
            ))
            .map(|(start, _)| start..)
            .change_context(DeserializeError)
    }
}

impl<'de, T> Deserialize<'de> for RangeTo<T>
where
    T: Deserialize<'de>,
{
    type Reflection = RangeReflection<<Option<()> as Deserialize<'de>>::Reflection, T::Reflection>;

    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
    where
        D: Deserializer<'de>,
    {
        deserializer
            .deserialize_struct(RangeVisitor::<Option<()>, T, Self::Reflection>(
                PhantomData,
                PhantomData,
            ))
            .map(|(_, end)| ..end)
            .change_context(DeserializeError)
    }
}

impl<'de, T> Deserialize<'de> for RangeToInclusive<T>
where
    T: Deserialize<'de>,
{
    type Reflection = RangeReflection<<Option<()> as Deserialize<'de>>::Reflection, T::Reflection>;

    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
    where
        D: Deserializer<'de>,
    {
        deserializer
            .deserialize_struct(RangeVisitor::<Option<()>, T, Self::Reflection>(
                PhantomData,
                PhantomData,
            ))
            .map(|(_, end)| ..=end)
            .change_context(DeserializeError)
    }
}

impl<'de> Deserialize<'de> for RangeFull {
    type Reflection = RangeReflection<
        <Option<()> as Deserialize<'de>>::Reflection,
        <Option<()> as Deserialize<'de>>::Reflection,
    >;

    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
    where
        D: Deserializer<'de>,
    {
        deserializer
            .deserialize_struct(RangeVisitor::<Option<()>, Option<()>, Self::Reflection>(
                PhantomData,
                PhantomData,
            ))
            .map(|(..)| ..)
            .change_context(DeserializeError)
    }
}
