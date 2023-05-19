use error_stack::{Result, ResultExt};

use crate::{
    error::{DeserializeError, VisitorError},
    ext::TupleExt,
    Deserialize, Deserializer, Document, EnumVisitor, FieldVisitor, ObjectAccess, Reflection,
    Schema, Visitor,
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

    fn visit_key<D>(&self, deserializer: D) -> Result<Self::Key, VisitorError>
    where
        D: Deserializer<'de>,
    {
        self.visitor.visit_discriminant(deserializer)
    }

    fn visit_value<D>(self, key: Self::Key, deserializer: D) -> Result<Self::Value, VisitorError>
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

    fn visit_object<A>(self, object: A) -> Result<Self::Value, VisitorError>
    where
        A: ObjectAccess<'de>,
    {
        let mut object = object.into_bound(1).change_context(VisitorError)?;

        let Some(value) = object
            .field(EnumObjectFieldVisitor {
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
            .fold_reports()
            .map(|(value, _)| value)
            .change_context(VisitorError)
    }
}

struct ExpectNoneVisitor;

impl<'de> Visitor<'de> for ExpectNoneVisitor {
    type Value = ExpectNone;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_none(self) -> Result<Self::Value, VisitorError> {
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

    fn deserialize<D>(deserializer: D) -> Result<Self, DeserializeError>
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
