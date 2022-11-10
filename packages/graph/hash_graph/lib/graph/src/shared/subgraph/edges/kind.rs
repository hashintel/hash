use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OntologyEdgeKind {
    /// An [`OntologyType`] can inherit from another [`OntologyType`]
    InheritsFrom,
    /// A [`PropertyType`] or [`DataType`] can reference a [`DataType`] to constrain values
    ConstrainsValuesOn,
    /// An [`EntityType`] or [`PropertyType`] can reference a [`PropertyType`] to constrain
    /// properties
    ConstrainsPropertiesOn,
    /// An [`EntityType`] can reference a [`Link`] [`EntityType`] to constrain the existence of
    /// certain kinds of [`Link`]s
    ConstrainsLinksOn,
    /// An [`EntityType`] can reference an [`EntityType`] to constrain the target entities of
    /// certain kinds of [`Link`]s
    ConstrainsLinkDestinationsOn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KnowledgeGraphEdgeKind {
    /// This [`Link`] [`Entity`] has another [`Entity`] on its 'left' endpoint
    /// The `reverse` of this would be the equivalent of saying an [`Entity`] has an outgoing
    /// `Link` [`Entity`]
    HasLeftEndpoint,
    /// This [`Link`] [`Entity`] has another [`Entity`] on its 'right' endpoint
    HasRightEndpoint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SharedEdgeKind {
    /// An [`Entity`] is of an [`EntityType`]
    IsOfType,
}
