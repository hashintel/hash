use core::{marker::PhantomData, ops::Bound};

use error_stack::{Result, ResultExt};

use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, FieldVisitor, Visitor,
};

enum BoundDiscriminant {
    Included,
    Excluded,
    Unbounded,
}

struct BoundDiscriminantVisitor;

impl<'de> Visitor<'de> for BoundDiscriminantVisitor {
    type Value = BoundDiscriminant;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_str(self, v: &str) -> error_stack::Result<Self::Value, VisitorError> {
        todo!()
    }
}

impl<'de> Deserialize<'de> for BoundDiscriminant {
    type Reflection = ();

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        todo!()
    }
}

struct BoundFieldVisitor<T>(PhantomData<fn() -> *const T>);

impl<'de, T> FieldVisitor<'de> for BoundFieldVisitor<T>
where
    T: Deserialize<'de>,
{
    type Key = BoundDiscriminant;
    type Value = Bound<T>;

    fn visit_value<D>(self, key: Self::Key, deserializer: D) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>,
    {
        match key {
            BoundDiscriminant::Included => T::deserialize(deserializer)
                .map(Bound::Included)
                .change_context(VisitorError),
            BoundDiscriminant::Excluded => T::deserialize(deserializer)
                .map(Bound::Included)
                .change_context(VisitorError),
            // unit variant, we need to make sure it is not there or null (or unit)
            // deserializing Option<()> is perfect, we don't care about the end result
            // just that it passed.
            BoundDiscriminant::Unbounded => Option::<()>::deserialize(deserializer)
                .map(|_| Bound::Unbounded)
                .change_context(VisitorError),
        }
    }
}
