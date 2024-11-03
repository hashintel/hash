use core::cmp::{Ordering, Reverse};

use error_stack::{Report, ResultExt as _};

use crate::{
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
    error::{
        DeserializeError, ExpectedVariant, ReceivedVariant, UnknownVariantError, Variant as _,
        VisitorError,
    },
};

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Reverse<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        T::deserialize(deserializer).map(Reverse)
    }
}

struct OrderingVisitor;

impl Visitor<'_> for OrderingVisitor {
    type Value = Ordering;

    fn expecting(&self) -> Document {
        Ordering::reflection()
    }

    fn visit_str(self, value: &str) -> Result<Self::Value, Report<VisitorError>> {
        match value {
            "Less" => Ok(Ordering::Less),
            "Equal" => Ok(Ordering::Equal),
            "Greater" => Ok(Ordering::Greater),
            _ => Err(Report::new(UnknownVariantError.into_error())
                .attach(ReceivedVariant::new(value))
                .attach(ExpectedVariant::new("Less"))
                .attach(ExpectedVariant::new("Equal"))
                .attach(ExpectedVariant::new("Greater"))
                .change_context(VisitorError)),
        }
    }

    fn visit_bytes(self, value: &[u8]) -> Result<Self::Value, Report<VisitorError>> {
        match value {
            b"Less" => Ok(Ordering::Less),
            b"Equal" => Ok(Ordering::Equal),
            b"Greater" => Ok(Ordering::Greater),
            _ => {
                let mut error = Report::new(UnknownVariantError.into_error())
                    .attach(ExpectedVariant::new("Less"))
                    .attach(ExpectedVariant::new("Equal"))
                    .attach(ExpectedVariant::new("Greater"));

                if let Ok(received) = core::str::from_utf8(value) {
                    error = error.attach(ReceivedVariant::new(received));
                }

                Err(error.change_context(VisitorError))
            }
        }
    }
}

impl Reflection for Ordering {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string").with("oneOf", ["Less", "Equal", "Greater"])
    }
}

// we can directly call `deserialize_str` because we only have identifier with no data
impl<'de> Deserialize<'de> for Ordering {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_str(OrderingVisitor)
            .change_context(DeserializeError)
    }
}
