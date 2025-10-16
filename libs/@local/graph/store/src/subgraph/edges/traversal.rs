use core::error::Error;

use super::{EdgeDirection, GraphResolveDepths};

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub enum EntityTraversalEdge {
    #[cfg_attr(feature = "utoipa", schema(title = "HasLeftEntityEdge"))]
    HasLeftEntity { direction: EdgeDirection },
    #[cfg_attr(feature = "utoipa", schema(title = "HasRightEntityEdge"))]
    HasRightEntity { direction: EdgeDirection },
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub enum TraversalEdge {
    #[cfg_attr(feature = "utoipa", schema(title = "InheritsFromEdge"))]
    InheritsFrom,
    #[cfg_attr(feature = "utoipa", schema(title = "ConstrainsValuesOnEdge"))]
    ConstrainsValuesOn,
    #[cfg_attr(feature = "utoipa", schema(title = "ConstrainsPropertiesOnEdge"))]
    ConstrainsPropertiesOn,
    #[cfg_attr(feature = "utoipa", schema(title = "ConstrainsLinksOnEdge"))]
    ConstrainsLinksOn,
    #[cfg_attr(feature = "utoipa", schema(title = "ConstrainsLinkDestinationsOnEdge"))]
    ConstrainsLinkDestinationsOn,
    #[cfg_attr(feature = "utoipa", schema(title = "IsOfTypeEdge"))]
    IsOfType,
    #[cfg_attr(feature = "utoipa", schema(title = "HasLeftEntityEdge"))]
    HasLeftEntity { direction: EdgeDirection },
    #[cfg_attr(feature = "utoipa", schema(title = "HasRightEntityEdge"))]
    HasRightEntity { direction: EdgeDirection },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub enum EntityTraversalEdgeKind {
    HasLeftEntity,
    HasRightEntity,
}

impl From<&EntityTraversalEdge> for EntityTraversalEdgeKind {
    fn from(edge: &EntityTraversalEdge) -> Self {
        match edge {
            EntityTraversalEdge::HasLeftEntity { .. } => Self::HasLeftEntity,
            EntityTraversalEdge::HasRightEntity { .. } => Self::HasRightEntity,
        }
    }
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
            TraversalEdge::InheritsFrom => Self::InheritsFrom,
            TraversalEdge::ConstrainsValuesOn => Self::ConstrainsValuesOn,
            TraversalEdge::ConstrainsPropertiesOn => Self::ConstrainsPropertiesOn,
            TraversalEdge::ConstrainsLinksOn => Self::ConstrainsLinksOn,
            TraversalEdge::ConstrainsLinkDestinationsOn => Self::ConstrainsLinkDestinationsOn,
            TraversalEdge::IsOfType => Self::IsOfType,
            TraversalEdge::HasLeftEntity { .. } => Self::HasLeftEntity,
            TraversalEdge::HasRightEntity { .. } => Self::HasRightEntity,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
#[display("Cannot convert traversal path edge of kind {_0:?} to entity traversal edge")]
pub struct TraversalPathConversionError(TraversalEdgeKind);

impl Error for TraversalPathConversionError {}

impl TryFrom<TraversalEdge> for EntityTraversalEdge {
    type Error = TraversalPathConversionError;

    fn try_from(value: TraversalEdge) -> Result<Self, Self::Error> {
        match value {
            TraversalEdge::HasLeftEntity { direction } => Ok(Self::HasLeftEntity { direction }),
            TraversalEdge::HasRightEntity { direction } => Ok(Self::HasRightEntity { direction }),
            ref edge @ (TraversalEdge::InheritsFrom
            | TraversalEdge::ConstrainsValuesOn
            | TraversalEdge::ConstrainsPropertiesOn
            | TraversalEdge::ConstrainsLinksOn
            | TraversalEdge::ConstrainsLinkDestinationsOn
            | TraversalEdge::IsOfType) => Err(TraversalPathConversionError(edge.into())),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTraversalPath {
    pub edges: Vec<EntityTraversalEdge>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TraversalPath {
    pub edges: Vec<TraversalEdge>,
}

impl TraversalPath {
    /// Splits the traversal path into entity edges and ontology edges.
    ///
    /// Entity traversal consists of edges that navigate between entities
    /// ([`HasLeftEntity`](TraversalEdge::HasLeftEntity),
    /// [`HasRightEntity`](TraversalEdge::HasRightEntity)). Ontology traversal begins when an
    /// [`IsOfType`](TraversalEdge::IsOfType) edge is encountered, transitioning to type-level
    /// navigation.
    ///
    /// # Returns
    ///
    /// A tuple containing:
    /// - A vector of entity edges collected from the start of the path until an ontology edge is
    ///   found
    /// - An optional slice of ontology edges:
    ///   - `Some(&[...])` if an [`IsOfType`](TraversalEdge::IsOfType) edge was encountered,
    ///     containing all edges after it
    ///   - `None` if no ontology traversal is needed (path contains only entity edges or ends
    ///     before reaching ontology)
    ///
    /// # Example
    ///
    /// ```ignore
    /// // Path: [HasLeft, HasRight, IsOfType, InheritsFrom]
    /// //   → entity_edges = [HasLeft, HasRight]
    /// //   → ontology_edges = Some([InheritsFrom])
    ///
    /// // Path: [HasLeft, HasRight]
    /// //   → entity_edges = [HasLeft, HasRight]
    /// //   → ontology_edges = None
    ///
    /// // Path: [HasLeft, ConstrainsPropertiesOn]
    /// //   → entity_edges = [HasLeft]
    /// //   → ontology_edges = None (ontology edge without IsOfType is unreachable)
    /// ```
    #[must_use]
    pub fn split_entity_path(&self) -> (Vec<EntityTraversalEdge>, Option<&[TraversalEdge]>) {
        let mut entity_edges = Vec::new();
        for (idx, edge) in self.edges.iter().enumerate() {
            match edge {
                TraversalEdge::HasLeftEntity { direction } => {
                    entity_edges.push(EntityTraversalEdge::HasLeftEntity {
                        direction: *direction,
                    });
                }
                TraversalEdge::HasRightEntity { direction } => {
                    entity_edges.push(EntityTraversalEdge::HasRightEntity {
                        direction: *direction,
                    });
                }
                TraversalEdge::IsOfType => {
                    // We found an `IsOfType` edge. From here onwards, we can use the
                    // existing traversal path for ontology edges
                    return (
                        entity_edges,
                        Some(self.edges.get((idx + 1)..).unwrap_or_default()),
                    );
                }

                TraversalEdge::InheritsFrom
                | TraversalEdge::ConstrainsValuesOn
                | TraversalEdge::ConstrainsPropertiesOn
                | TraversalEdge::ConstrainsLinksOn
                | TraversalEdge::ConstrainsLinkDestinationsOn => {
                    // We did not found an `IsOfType` edge, so all subsequent edges can
                    // be discarded
                    break;
                }
            }
        }

        (entity_edges, None)
    }
}

impl TryFrom<TraversalPath> for EntityTraversalPath {
    type Error = TraversalPathConversionError;

    fn try_from(path: TraversalPath) -> Result<Self, Self::Error> {
        path.edges
            .into_iter()
            .map(EntityTraversalEdge::try_from)
            .collect::<Result<Vec<_>, _>>()
            .map(|edges| Self { edges })
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase")]
pub enum SubgraphTraversalParams {
    ResolveDepths {
        traversal_paths: Vec<EntityTraversalPath>,
        graph_resolve_depths: GraphResolveDepths,
    },
    Paths {
        traversal_paths: Vec<TraversalPath>,
    },
}

#[derive(Debug, Copy, Clone)]
pub enum BorrowedTraversalParams<'e> {
    ResolveDepths {
        traversal_path: &'e [EntityTraversalEdge],
        graph_resolve_depths: GraphResolveDepths,
    },
    Path {
        traversal_path: &'e [TraversalEdge],
    },
}

impl BorrowedTraversalParams<'_> {
    #[must_use]
    pub fn contains(&self, other: &Self) -> bool {
        match (self, other) {
            (
                BorrowedTraversalParams::ResolveDepths {
                    graph_resolve_depths: self_depths,
                    traversal_path: self_path,
                },
                BorrowedTraversalParams::ResolveDepths {
                    graph_resolve_depths: other_depths,
                    traversal_path: other_path,
                },
            ) => self_path.starts_with(other_path) && self_depths.contains(*other_depths),
            (
                BorrowedTraversalParams::Path {
                    traversal_path: self_path,
                },
                BorrowedTraversalParams::Path {
                    traversal_path: other_path,
                },
            ) => self_path.starts_with(other_path),
            _ => false,
        }
    }
}

impl EntityTraversalPath {
    #[must_use]
    pub fn has_edge_kind(&self, kind: EntityTraversalEdgeKind) -> bool {
        self.edges
            .iter()
            .any(|edge| EntityTraversalEdgeKind::from(edge) == kind)
    }
}

impl TraversalPath {
    #[must_use]
    pub fn has_edge_kind(&self, kind: TraversalEdgeKind) -> bool {
        self.edges
            .iter()
            .any(|edge| TraversalEdgeKind::from(edge) == kind)
    }
}
