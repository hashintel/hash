use alloc::collections::BTreeSet;
use core::hash::Hash;
use std::collections::HashSet;

use serde::{Deserialize, Deserializer, de};

/// Deserializes a vector of values ensuring they are unique using hash-based comparison.
///
/// Uses a [`HashSet`] to detect and reject duplicate values during deserialization,
/// making it suitable for types that implement `Hash` and `Eq`.
///
/// # Examples
///
/// ```rust
/// use hash_codec::serde::unique_vec;
/// use serde::{Deserialize, Serialize};
///
/// #[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
/// struct Item {
///     id: u32,
/// }
///
/// #[derive(Debug, Deserialize)]
/// struct Container {
///     #[serde(deserialize_with = "unique_vec::hashed")]
///     items: Vec<Item>,
/// }
///
/// // This would fail if items contained duplicates
/// let json = r#"{"items":[{"id":1},{"id":2}]}"#;
/// let container: Container = serde_json::from_str(json).unwrap();
/// ```
///
/// # Errors
///
/// - if the vector contains duplicate items based on hash equality
pub fn hashed<'de, D, T: Hash + Eq + Deserialize<'de>>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
{
    let vec = Vec::deserialize(deserializer)?;
    if vec.len() != vec.iter().collect::<HashSet<_>>().len() {
        return Err(de::Error::custom("duplicate value"));
    }
    Ok(vec)
}

/// Deserializes a vector of values ensuring they are unique using ordered comparison.
///
/// Uses a [`BTreeSet`] to detect and reject duplicate values during deserialization,
/// making it suitable for types that implement `Ord`.
///
/// # Examples
///
/// ```rust
/// use hash_codec::serde::unique_vec;
/// use serde::{Deserialize, Serialize};
///
/// #[derive(Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
/// struct SortableItem {
///     id: u32,
/// }
///
/// #[derive(Debug, Deserialize)]
/// struct Container {
///     #[serde(deserialize_with = "unique_vec::btree")]
///     items: Vec<SortableItem>,
/// }
///
/// // This would fail if items contained duplicates
/// let json = r#"{"items":[{"id":1},{"id":2}]}"#;
/// let container: Container = serde_json::from_str(json).unwrap();
/// ```
///
/// # Errors
///
/// - if the vector contains duplicate items based on ordered comparison
pub fn btree<'de, D, T: Ord + Deserialize<'de>>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
{
    let vec = Vec::deserialize(deserializer)?;
    if vec.len() != vec.iter().collect::<BTreeSet<_>>().len() {
        return Err(de::Error::custom("duplicate value"));
    }
    Ok(vec)
}
