use core::marker::PhantomData;

use error_stack::{Result, ResultExt};

use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
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
        //  currently we're unable to express that constraint (something for 0.2)
        Schema::new("null")
    }
}

impl<'de, T: ?Sized> Deserialize<'de> for PhantomData<T> {
    type Reflection = PhantomDataReflection;

    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, DeserializeError> {
        deserializer
            .deserialize_null(PhantomDataVisitor(Self))
            .change_context(DeserializeError)
    }
}
