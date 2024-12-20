use core::time::Duration;

use error_stack::Report;

use crate::{Deserialize, Deserializer, error::DeserializeError};

impl<'de> Deserialize<'de> for Duration {
    type Reflection = <f64 as Deserialize<'de>>::Reflection;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        f64::deserialize(deserializer).map(Self::from_secs_f64)
    }
}
