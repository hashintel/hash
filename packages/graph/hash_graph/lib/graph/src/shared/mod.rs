use serde::{
    ser::{Error, SerializeMap},
    Serialize, Serializer,
};

pub mod identifier;
pub mod provenance;
pub mod subgraph;

pub(super) fn serialize_map_with_escaped_object_keys<K, V, I, S>(
    iter: I,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    K: Serialize,
    V: Serialize,
    I: IntoIterator<Item = (K, V)>,
    S: Serializer,
{
    let iter = iter.into_iter();
    let mut map = serializer.serialize_map(Some(iter.size_hint().0))?;
    for (key, val) in iter {
        map.serialize_entry(
            &serde_json::to_string(&key).map_err(|err| S::Error::custom(err.to_string()))?,
            &val,
        )?;
    }
    map.end()
}
