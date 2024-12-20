use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use serde::{Serialize, Serializer, ser::SerializeMap as _};

use crate::{
    Deserialize, Deserializer, Document, EnumVisitor, FieldVisitor, ObjectAccess, Reflection,
    Schema, Visitor,
    error::{DeserializeError, VisitorError},
    schema::Reference,
};

struct EnumObjectFieldVisitor<T> {
    visitor: T,
}

impl<'de, T> FieldVisitor<'de> for EnumObjectFieldVisitor<T>
where
    T: EnumVisitor<'de>,
{
    type Key = T::Discriminant;
    type Value = T::Value;

    fn visit_key<D>(&self, deserializer: D) -> Result<Self::Key, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        self.visitor.visit_discriminant(deserializer)
    }

    fn visit_value<D>(
        self,
        key: Self::Key,
        deserializer: D,
    ) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        self.visitor.visit_value(key, deserializer)
    }
}

pub struct EnumObjectVisitor<T> {
    visitor: T,
}

impl<T> EnumObjectVisitor<T> {
    #[must_use]
    pub const fn new(visitor: T) -> Self {
        Self { visitor }
    }
}

impl<'de, T> Visitor<'de> for EnumObjectVisitor<T>
where
    T: EnumVisitor<'de>,
{
    type Value = T::Value;

    fn expecting(&self) -> Document {
        self.visitor.expecting()
    }

    fn visit_object<A>(self, object: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ObjectAccess<'de>,
    {
        let mut object = object.into_bound(1).change_context(VisitorError)?;

        let Some(value) = object.field(EnumObjectFieldVisitor {
            visitor: self.visitor,
        }) else {
            // `into_bound` guarantees that we can call exactly `n` times (here `1`) and we
            // will always get exactly `n` `Some` back, this means getting to this point is UB and
            // theoretically, due to the fact that `BoundObjectAccess` is controlled by `deer`
            // impossible.
            unreachable!();
        };

        let end = object.end();

        (value, end)
            .try_collect()
            .map(|(value, ())| value)
            .change_context(VisitorError)
    }
}

struct ExpectNoneVisitor;

impl Visitor<'_> for ExpectNoneVisitor {
    type Value = ExpectNone;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_none(self) -> Result<Self::Value, Report<VisitorError>> {
        Ok(ExpectNone)
    }
}

// special type that is used to `Skip` / expect None
pub struct ExpectNone;

impl Reflection for ExpectNone {
    fn schema(_: &mut Document) -> Schema {
        // TODO: for now we are unable to model the reflection of the absence of a value
        Schema::new("none")
    }
}

impl<'de> Deserialize<'de> for ExpectNone {
    type Reflection = Self;

    fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
    where
        D: Deserializer<'de>,
    {
        // There is no way to directly `deserialize_none` (for good reason), so instead we say:
        // `deserialize_any`, this is okay, because we expect both self-describing formats and non
        // self-describing formats (if they are called from this method) to fail.
        // Other functions to `deserialize_any` could aid in recovery, but that isn't really
        // possible with non self-describing formats anyway.
        deserializer
            .deserialize_any(ExpectNoneVisitor)
            .change_context(DeserializeError)
    }
}

// TODO: consider adding an error attachment marker type for "short-circuit"

pub struct Properties<const N: usize>(pub [(&'static str, Reference); N]);

impl<const N: usize> Serialize for Properties<N> {
    fn serialize<S>(&self, serializer: S) -> core::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;

        for (key, value) in self.0 {
            map.serialize_entry(key, &value)?;
        }

        map.end()
    }
}
