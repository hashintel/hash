use alloc::{string::String, vec::Vec};
use core::{marker::PhantomData, mem::ManuallyDrop};

use error_stack::{Result, ResultExt};

use crate::{
    error::{DeserializeError, VisitorError},
    ArrayAccess, Deserialize, Deserializer, Document, Number, ObjectAccess, Reflection, Schema,
    Visitor,
};

struct PhantomDataVisitor<T: ?Sized>(PhantomData<T>);

impl<'de, T: ?Sized> Visitor<'de> for PhantomDataVisitor<T> {
    type Value = PhantomData<T>;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_none(self) -> Result<Self::Value, VisitorError> {
        Ok(PhantomData)
    }

    fn visit_null(self) -> Result<Self::Value, VisitorError> {
        Ok(PhantomData)
    }
}

pub struct PhantomDataReflection;

impl Reflection for PhantomDataReflection {
    fn schema(_: &mut Document) -> Schema {
        // TODO: this is also optional (none)
        Schema::new("null")
    }
}

impl<'de, T: ?Sized> Deserialize<'de> for PhantomData<T> {
    type Reflection = PhantomDataReflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_null(PhantomDataVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}

pub struct ManuallyDropVisitor<T: ?Sized>(PhantomData<T>);

impl<'de, T: Deserialize<'de>> Visitor<'de> for ManuallyDropVisitor<T> {
    type Value = ManuallyDrop<T>;

    fn expecting(&self) -> Document {
        todo!()
    }
}

impl<T: Reflection> Reflection for ManuallyDrop<T> {
    fn schema(doc: &mut Document) -> Schema {
        T::schema(doc)
    }
}
