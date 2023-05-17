use core::time::Duration;

use error_stack::Result;

use crate::{error::DeserializeError, Deserialize, Deserializer};

impl<'de> Deserialize<'de> for Duration {
    type Reflection = <f64 as Deserialize<'de>>::Reflection;

    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, DeserializeError> {
        f64::deserialize(deserializer).map(Self::from_secs_f64)
    }
}
