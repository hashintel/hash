use super::GraphResolveDepths;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case")]
pub enum EntityTraversalEdgeDirection {
    Incoming,
    Outgoing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case")]
pub enum OntologyTraversalEdgeDirection {
    Outgoing,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub enum TraversalEdge {
    #[cfg_attr(feature = "utoipa", schema(title = "InheritsFromEdge"))]
    InheritsFrom {
        direction: OntologyTraversalEdgeDirection,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "ConstrainsValuesOnEdge"))]
    ConstrainsValuesOn {
        direction: OntologyTraversalEdgeDirection,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "ConstrainsPropertiesOnEdge"))]
    ConstrainsPropertiesOn {
        direction: OntologyTraversalEdgeDirection,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "ConstrainsLinksOnEdge"))]
    ConstrainsLinksOn {
        direction: OntologyTraversalEdgeDirection,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "ConstrainsLinkDestinationsOnEdge"))]
    ConstrainsLinkDestinationsOn {
        direction: OntologyTraversalEdgeDirection,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "IsOfTypeEdge"))]
    IsOfType {
        direction: OntologyTraversalEdgeDirection,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "HasLeftEntityEdge"))]
    HasLeftEntity {
        direction: EntityTraversalEdgeDirection,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "HasRightEntityEdge"))]
    HasRightEntity {
        direction: EntityTraversalEdgeDirection,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub enum TraversalEdgeKind {
    InheritsFrom,
    ConstrainsValuesOn,
    ConstrainsPropertiesOn,
    ConstrainsLinksOn,
    ConstrainsLinkDestinationsOn,
    IsOfType,
    HasLeftEntity,
    HasRightEntity,
}

impl From<&TraversalEdge> for TraversalEdgeKind {
    fn from(edge: &TraversalEdge) -> Self {
        match edge {
            TraversalEdge::InheritsFrom { .. } => Self::InheritsFrom,
            TraversalEdge::ConstrainsValuesOn { .. } => Self::ConstrainsValuesOn,
            TraversalEdge::ConstrainsPropertiesOn { .. } => Self::ConstrainsPropertiesOn,
            TraversalEdge::ConstrainsLinksOn { .. } => Self::ConstrainsLinksOn,
            TraversalEdge::ConstrainsLinkDestinationsOn { .. } => {
                Self::ConstrainsLinkDestinationsOn
            }
            TraversalEdge::IsOfType { .. } => Self::IsOfType,
            TraversalEdge::HasLeftEntity { .. } => Self::HasLeftEntity,
            TraversalEdge::HasRightEntity { .. } => Self::HasRightEntity,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TraversalPath {
    pub edges: Vec<TraversalEdge>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase")]
pub enum SubgraphTraversalParams {
    ResolveDepths {
        graph_resolve_depths: GraphResolveDepths,
    },
    Paths {
        traversal_paths: Vec<TraversalPath>,
    },
}

#[derive(Debug, Copy, Clone)]
pub enum BorrowedTraversalParams<'e> {
    ResolveDepths {
        graph_resolve_depths: GraphResolveDepths,
    },
    Path {
        traversal_path: &'e [TraversalEdge],
    },
}

impl TraversalPath {
    #[must_use]
    pub fn has_edge_kind(&self, kind: TraversalEdgeKind) -> bool {
        self.edges
            .iter()
            .any(|edge| TraversalEdgeKind::from(edge) == kind)
    }
}
