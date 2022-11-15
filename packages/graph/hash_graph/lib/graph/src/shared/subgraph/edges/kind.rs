use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OntologyEdgeKind {
    /// An ontology type can inherit from another ontology type.
    InheritsFrom,
    /// A [`PropertyType`] or [`DataType`] can reference a [`DataType`] to constrain values.
    ///
    /// [`DataType`]: type_system::DataType
    /// [`PropertyType`]: type_system::PropertyType
    ConstrainsValuesOn,
    /// An [`EntityType`] or [`PropertyType`] can reference a [`PropertyType`] to constrain
    /// properties.
    ///
    /// [`PropertyType`]: type_system::PropertyType
    /// [`EntityType`]: type_system::EntityType
    ConstrainsPropertiesOn,
    /// An [`EntityType`] can reference a link [`EntityType`] to constrain the existence of
    /// certain kinds of links.
    ///
    /// [`EntityType`]: type_system::EntityType
    ConstrainsLinksOn,
    /// An [`EntityType`] can reference an [`EntityType`] to constrain the target entities of
    /// certain kinds of links.
    ///
    /// [`EntityType`]: type_system::EntityType
    ConstrainsLinkDestinationsOn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KnowledgeGraphEdgeKind {
    /// This link [`Entity`] has another [`Entity`] on its 'left' endpoint.
    ///
    /// The `reverse` of this would be the equivalent of saying an [`Entity`] has an outgoing
    /// `Link` [`Entity`].
    ///
    /// [`Entity`]: crate::knowledge::Entity
    HasLeftEndpoint,
    /// This link [`Entity`] has another [`Entity`] on its 'right' endpoint.
    ///
    /// [`Entity`]: crate::knowledge::Entity
    HasRightEndpoint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SharedEdgeKind {
    /// An [`Entity`] is of an [`EntityType`].
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`EntityType`]: type_system::EntityType
    IsOfType,
}
