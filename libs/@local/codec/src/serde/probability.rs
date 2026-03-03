use serde::{
    de::{self, Deserialize as _, Deserializer},
    ser::Serializer,
};

/// Serialize a [`f64`] as a probability.
///
/// This is only here to allow the use of `#[serde(with = "probability")]`.
///
/// # Errors
///
/// This function can return any error that can be returned by serializing a [`f64`].
#[inline]
#[expect(clippy::trivially_copy_pass_by_ref, reason = "Used in serde macros")]
pub fn serialize<S>(probability: &f64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_f64(*probability)
}

/// Deserialize a [`f64`] as a probability.
///
/// # Errors
///
/// - If the value is not between 0.0 and 1.0
pub fn deserialize<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: Deserializer<'de>,
{
    let probability = f64::deserialize(deserializer)?;
    if !(0.0..=1.0).contains(&probability) {
        return Err(de::Error::custom(format!(
            "probability must be between 0.0 and 1.0, got {probability}"
        )));
    }
    Ok(probability)
}

pub mod option {
    use serde::{
        de::{self, Deserialize as _, Deserializer},
        ser::{Serialize as _, Serializer},
    };

    /// Serialize an optional [`f64`] as a probability.
    ///
    /// # Errors
    ///
    /// - If the serialization of the string fails.
    pub fn serialize<S: Serializer>(
        probability: &Option<f64>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        probability.serialize(serializer)
    }

    /// Deserialize an optional [`f64`] as a probability.
    ///
    /// # Errors
    ///
    /// - If the deserialization of the string fails.
    /// - If the probability is not between 0.0 and 1.0
    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<f64>, D::Error> {
        let probability = Option::<f64>::deserialize(deserializer)?;
        if let Some(probability) = probability
            && !(0.0..=1.0).contains(&probability)
        {
            return Err(de::Error::custom(format!(
                "probability must be between 0.0 and 1.0, got {probability}"
            )));
        }
        Ok(probability)
    }
}
