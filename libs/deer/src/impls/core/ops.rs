use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, Visitor,
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

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        todo!()
    }
}
