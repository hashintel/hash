#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{self, KnownFormat, SchemaFormat},
};

#[derive(Debug, Copy, Clone, PartialEq, PartialOrd, Serialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[repr(transparent)]
pub struct Confidence(
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Brand<number, \"Confidence\">"))] f64,
);

impl Confidence {
    #[must_use]
    pub fn new(value: f64) -> Option<Self> {
        (0.0..=1.0).contains(&value).then_some(Self(value))
    }

    #[must_use]
    pub const fn value(self) -> f64 {
        self.0
    }
}

impl<'de> Deserialize<'de> for Confidence {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = f64::deserialize(deserializer)?;
        if !(0.0..=1.0).contains(&value) {
            return Err(serde::de::Error::custom(
                "Confidence must be between 0 and 1",
            ));
        }
        Ok(Self(value))
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for Confidence {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "Confidence",
            openapi::Schema::Object(
                openapi::schema::ObjectBuilder::new()
                    .schema_type(openapi::SchemaType::Number)
                    .format(Some(SchemaFormat::KnownFormat(KnownFormat::Double)))
                    .minimum(Some(0.0))
                    .maximum(Some(1.0))
                    .build(),
            )
            .into(),
        )
    }
}
