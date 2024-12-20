use error_stack::{Report, ResultExt as _};

use crate::{
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
    error::{DeserializeError, VisitorError},
};

struct UnitVisitor;

impl Visitor<'_> for UnitVisitor {
    type Value = ();

    fn expecting(&self) -> Document {
        <()>::reflection()
    }

    fn visit_null(self) -> Result<Self::Value, Report<VisitorError>> {
        Ok(())
    }
}

pub struct UnitReflection;

// We do not implement `Reflection` on `()` automatically, as `()` is often the default for
// auto-completing implementation, therefore implementing `Reflection` for `()` would likely lead to
// quite a lot of user errors
impl Reflection for UnitReflection {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("null")
    }
}

impl<'de> Deserialize<'de> for () {
    type Reflection = UnitReflection;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_null(UnitVisitor)
            .change_context(DeserializeError)
    }
}

// we do not implement for `!` (never type), as that type is *never* supposed to be instantiated/be
// present, a `!` value also has no type
