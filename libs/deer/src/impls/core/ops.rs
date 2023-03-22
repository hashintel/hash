//! # Note
//!
//! This follows exactly has serde implements `Range`, the only range is:
//! * `RangeFrom`, `RangeTo`, `RangeFull` are supported
//!
//! Ideally we'd want to move away from serde to better represent each range, instead of `{start,
//! end}` do `{start: Bound, end: Bound}`. For the sake of compatability as `deer` has no serialize
//! equivalent this uses the same as `serde`.

use core::{marker::PhantomData, ops::Bound};

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        DeserializeError, ExpectedLength, FieldAccessError, ObjectLengthError, ReceivedLength,
        Variant, VisitorError,
    },
    Deserialize, Deserializer, Document, FieldAccess, ObjectAccess, Visitor,
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
            BoundField::Excluded => T::deserialize(deserializer).map(BoundField::Excluded),
            BoundField::Included => T::deserialize(deserializer).map(BoundField::Included),
        }
        .change_context(FieldAccessError)
    }
}

enum BoundField {
    Excluded,
    Included,
    // Unbounded is a str
    // Unbounded,
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

    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
        todo!()
    }

    fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
        todo!()
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

        todo!()
    }
}

impl<'de, T: 'de> Deserialize<'de> for Bound<T> {
    type Reflection = ();

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        todo!()
    }
}
