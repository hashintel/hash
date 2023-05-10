use std::marker::PhantomData;

use query_builder_derive::QueryBuilder;
type JsonPath<'p> = PhantomData<&'p ()>;

#[derive(QueryBuilder)]
pub enum QueryPath<'p> {
    /// Corresponds to [`Entity::properties`].
    ///
    /// Deserializes from `["properties", ...]` where `...` is a path to a property URL of an
    /// [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!([
    ///     "properties",
    ///     "https://blockprotocol.org/@blockprotocol/types/property-type/address/",
    ///     0,
    ///     "street"
    /// ]))?;
    /// assert_eq!(
    ///     path.to_string(),
    ///     r#"properties.$."https://blockprotocol.org/@blockprotocol/types/property-type/address/"[0]."street""#
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`Entity::properties`]: crate::knowledge::Entity::properties
    #[builder(next = "properties")]
    Properties(Option<JsonPath<'p>>),
}

fn main() {}
