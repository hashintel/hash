use alloc::collections::BTreeSet;
use core::hash::Hash;
use std::collections::HashSet;

use serde::{Deserialize, Deserializer, de};

/// Deserialize a vector of values that are unique.
///
/// Uses a [`HashSet`] to ensure that the values are unique.
///
/// # Errors
///
/// - If the vector contains duplicate values.
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

/// Deserialize a vector of values that are unique.
///
/// Uses a [`BTreeSet`] to ensure that the values are unique.
///
/// # Errors
///
/// - If the vector contains duplicate values.
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
