use alloc::boxed::Box;
use core::fmt;

use error_stack::{Report, ResultExt as _};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::value::RawValue;

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum PayloadError {
    #[display("could not encode the payload")]
    Encode,
    #[display("could not decode the payload")]
    Decode,
}

/// A run's input or a step's output, encoded as JSON.
///
/// Payloads compare by their bytes, so a value must encode to the same bytes each time. Maps in a
/// payload are `BTreeMap`s, whose keys encode in sorted order. A journal must return a payload's
/// bytes exactly as they were written.
///
/// `Debug` prints only the length, since a payload can hold row values.
#[derive(Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Payload(Box<RawValue>);

impl Payload {
    /// # Errors
    ///
    /// Returns [`PayloadError::Encode`] if `value` cannot be serialized as JSON.
    pub fn encode<T: Serialize>(value: &T) -> Result<Self, Report<PayloadError>> {
        serde_json::value::to_raw_value(value)
            .map(Self)
            .change_context(PayloadError::Encode)
    }

    /// # Errors
    ///
    /// Returns [`PayloadError::Decode`] if the payload is not a `T`.
    pub fn decode<T: DeserializeOwned>(&self) -> Result<T, Report<PayloadError>> {
        serde_json::from_str(self.0.get()).change_context(PayloadError::Decode)
    }
}

impl PartialEq for Payload {
    fn eq(&self, other: &Self) -> bool {
        self.0.get() == other.0.get()
    }
}

impl Eq for Payload {}

impl fmt::Debug for Payload {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "Payload({} bytes)", self.0.get().len())
    }
}

#[cfg(test)]
mod tests {
    use alloc::format;

    use crate::Payload;

    #[test]
    fn payload_debug() {
        let payload = Payload::encode(&"row value").expect("should encode a string");
        assert_eq!(
            format!("{payload:?}"),
            "Payload(11 bytes)",
            "debug output should not include the JSON"
        );
    }
}
