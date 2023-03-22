//! # Note
//!
//! This follows exactly has serde implements `Range`, the only range is:
//! * `RangeFrom`, `RangeTo`, `RangeFull` are supported
//! * `Bounds::Unbounded` = `{"Unbounded": null}` instead of `"Unbounded"`
//!
//! Why is `Bounds::Unbounded` different? This ensures that everything is always consistent with
//! each other, this also means that we only need to invoke `visit_object`.
//!
//! Ideally we'd want to move away from serde to better represent each range, instead of `{start,
//! end}` do `{start: Bound, end: Bound}`. For the sake of compatability as `deer` has no serialize
//! equivalent this uses the same as `serde`.
// TODO: deserialize as string as a special container instruction? or automatic?
// TODO: do we want a special visitor just for enums, e.g. EnumVisitor? that can only be supplied to
//  visit_enum?

use core::{marker::PhantomData, ops::Bound};

use error_stack::{FutureExt, IntoReport, Report, Result, ResultExt};

use crate::{
    error::{
        DeserializeError, ExpectedLength, ExpectedVariant, FieldAccessError, ObjectLengthError,
        ReceivedLength, ReceivedVariant, UnknownVariantError, Variant, VisitorError,
    },
    impls::helpers::{FieldDiscriminatorKey, FieldDiscriminatorKeyAccess},
    schema::Reference,
    Deserialize, Deserializer, Document, FieldAccess, ObjectAccess, Reflection, Schema, Visitor,
};

struct BoundFieldAccess<T>(PhantomData<fn() -> *const T>);

impl<'de, T> FieldAccess<'de> for BoundFieldAccess<T>
where
    T: Deserialize<'de>,
{
    type Key = BoundField;
    type Value = Bound<T>;

    fn value<D>(&self, key: &Self::Key, deserializer: D) -> Result<Self::Value, FieldAccessError>
    where
        D: Deserializer<'de>,
    {
        match key {
            BoundField::Excluded => T::deserialize(deserializer).map(Bound::Excluded),
            BoundField::Included => T::deserialize(deserializer).map(Bound::Included),
            BoundField::Unbounded => <()>::deserialize(deserializer).map(|_| Bound::Unbounded),
        }
        .change_context(FieldAccessError)
    }
}

enum BoundField {
    Excluded,
    Included,
    Unbounded,
}

impl Reflection for BoundField {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string").with("enum", ["Included", "Excluded", "Unbounded"])
    }
}

impl FieldDiscriminatorKey for BoundField {
    const VARIANTS: &'static [&'static str] = &["Included", "Excluded", "Unbounded"];

    fn try_str(value: &str) -> Option<Self> {
        match value {
            "Included" => Some(BoundField::Included),
            "Excluded" => Some(BoundField::Excluded),
            "Unbounded" => Some(BoundField::Unbounded),
            _ => None,
        }
    }

    fn try_bytes(value: &[u8]) -> Option<Self> {
        match value {
            b"Included" => Some(BoundField::Included),
            b"Excluded" => Some(BoundField::Excluded),
            b"Unbounded" => Some(BoundField::Unbounded),
            _ => None,
        }
    }
}

impl<'de> Deserialize<'de> for BoundField {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_str(FieldDiscriminatorKeyAccess::new())
            .change_context(DeserializeError)
    }
}

struct BoundVisitor<T>(PhantomData<fn() -> *const T>);

impl<'de, T> Visitor<'de> for BoundVisitor<T>
where
    T: Deserialize<'de>,
{
    type Value = Bound<T>;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_object<U>(self, mut v: U) -> Result<Self::Value, VisitorError>
    where
        U: ObjectAccess<'de>,
    {
        v.set_bounded(1).change_context(VisitorError)?;

        let Some(field) = v.field(BoundFieldAccess(PhantomData)) else {
            return Err(Report::new(ObjectLengthError.into_error())
                .attach(ExpectedLength::new(1))
                .attach(ReceivedLength::new(0))
                .change_context(VisitorError));
        };

        v.end().change_context(VisitorError)?;

        field.map(|(_, value)| value).change_context(VisitorError)
    }
}

struct BoundReflection<T: ?Sized>(PhantomData<*const T>);

impl<T> Reflection for BoundReflection<T>
where
    T: Reflection + ?Sized,
{
    /// # Schema
    ///
    /// ```json
    /// {
    ///     "type": "object",
    ///     "additionalProperties": false,
    ///     "oneOf": [
    ///         {"properties": {"Included": <ref>}}
    ///         {"properties": {"Excluded": <ref>}}
    ///         {"properties": {"Unbounded": <ref>}}
    ///     ]
    /// }
    /// ```
    fn schema(doc: &mut Document) -> Schema {
        #[derive(serde::Serialize)]
        enum Properties {
            Included(Reference),
            Excluded(Reference),
            Unbounded(Reference),
        }

        Schema::new("object")
            .with("oneOf", [
                Properties::Included(doc.add::<T>()),
                Properties::Excluded(doc.add::<T>()),
                Properties::Unbounded(doc.add::<()>()),
            ])
            .with("additionalProperties", false)
    }
}

impl<'de, T> Deserialize<'de> for Bound<T>
where
    T: Deserialize<'de>,
{
    type Reflection = BoundReflection<T::Reflection>;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_object(BoundVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
