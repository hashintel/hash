//! Text adapters for definition names, without modifying the definition crate.

use alloc::collections::BTreeMap;
use core::{fmt::Display, str::FromStr};

use hash_integrations_definition::{ConnectorId, SourceName};
use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error as _};

pub(super) fn serialize_connector<S: Serializer>(
    value: &ConnectorId,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.collect_str(value)
}
pub(super) fn deserialize_connector<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<ConnectorId, D::Error> {
    from_text(deserializer)
}

fn from_text<'de, D: Deserializer<'de>, T: FromStr>(deserializer: D) -> Result<T, D::Error>
where
    T::Err: Display,
{
    String::deserialize(deserializer)?
        .parse()
        .map_err(D::Error::custom)
}

pub(crate) mod sources {
    use serde::{de::Error as _, ser::SerializeMap as _};

    use super::{BTreeMap, Deserialize, Deserializer, Serialize, Serializer, SourceName};

    pub(crate) fn serialize<S: Serializer, T: Serialize>(
        values: &BTreeMap<SourceName, T>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(values.len()))?;
        for (name, value) in values {
            map.serialize_entry(name.as_ref(), value)?;
        }
        map.end()
    }
    pub(crate) fn deserialize<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
        deserializer: D,
    ) -> Result<BTreeMap<SourceName, T>, D::Error> {
        BTreeMap::<String, T>::deserialize(deserializer)?
            .into_iter()
            .map(|(name, value)| Ok((name.parse().map_err(D::Error::custom)?, value)))
            .collect()
    }
}
