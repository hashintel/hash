use alloc::{string::String, vec::Vec};
use core::{fmt, marker::PhantomData};

use serde::de::{Deserialize, Deserializer, MapAccess, Visitor};
use serde_saphyr::Spanned;

/// A YAML mapping whose keys keep their source locations, in document order.
///
/// The YAML parser rejects duplicate keys before this type sees them.
#[derive(Debug)]
pub(super) struct SpannedMap<V>(Vec<(Spanned<String>, V)>);

impl<V> SpannedMap<V> {
    pub(super) fn iter(&self) -> impl Iterator<Item = (&Spanned<String>, &V)> {
        self.0.iter().map(|(key, value)| (key, value))
    }
}

impl<V> Default for SpannedMap<V> {
    fn default() -> Self {
        Self(Vec::new())
    }
}

struct SpannedMapVisitor<V>(PhantomData<V>);

impl<'de, V: Deserialize<'de>> Visitor<'de> for SpannedMapVisitor<V> {
    type Value = SpannedMap<V>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a mapping")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut entries = Vec::new();
        while let Some(entry) = map.next_entry::<Spanned<String>, V>()? {
            entries.push(entry);
        }
        Ok(SpannedMap(entries))
    }
}

impl<'de, V: Deserialize<'de>> Deserialize<'de> for SpannedMap<V> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(SpannedMapVisitor(PhantomData))
    }
}
