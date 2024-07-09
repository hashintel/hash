mod raw;

use serde::{Deserialize, Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(from = "raw::ArraySchema<T>")]
pub struct ArraySchema<T> {
    pub items: T,
    pub min_items: Option<usize>,
    pub max_items: Option<usize>,
}

impl<T> Serialize for ArraySchema<T>
where
    T: Serialize,
{
    #[inline]
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::ArraySchemaRef::from(self).serialize(serializer)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged)]
pub enum ValueOrArray<T> {
    Value(T),
    Array(ArraySchema<T>),
}
