//! Source geometry and hydrated details for a visible node's ego graph.
//!
//! Construction resolves either source identity into the captured scene and caps its incident edges
//! before hydration.

use alloc::alloc::Allocator;
use core::{error::Error, fmt};

use error_stack::{Report, ResultExt as _};
use hashql_core::id::IdVec;
use type_system::knowledge::entity::EntityId;

use self::{
    subgraph::{LocateSubgraph, SourcePoint},
    trailer::LocateTrailer,
};
use super::{Document, codec::Envelope, masks::TypeMasks};
use crate::{
    file::generation::GenerationId,
    identity::{EdgeRowId, NodeRowId},
    math::Vec2,
    morton::MortonTile,
    postgres::id::ArchivedEntityId,
    serve2::{
        codec::EncodedRowId,
        hydrate::{
            EdgeSlot, LocateEntity, LocateRequest, LocateResolver, LocateResponse, NodeSlot,
        },
        membership::OntologySelection,
        neighbourhood::DeliveredEdge,
        scene::Scene,
    },
};

mod codec;
mod subgraph;
mod trailer;

#[cfg(test)]
mod tests;

/// A node named by its upstream identity or encoded row.
#[derive(Debug, Copy, Clone)]
pub(crate) enum LocateSource {
    Key(EntityId),
    Row(EncodedRowId<NodeRowId>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocateLimits {
    /// Most requested types, including duplicates. The default is 32.
    pub colored_type_ids: u32 = 32,
    /// Most incident edges. The default is 512.
    pub edges: u32 = 512,
    /// Most scalar properties on the source. The default is 10.
    pub properties: u32 = 10,
    /// Most direct types per link. The default is 5.
    pub link_type_ids: u32 = 5,
    /// Most scalar properties per link. The default is 10.
    pub link_properties: u32 = 10,
}

pub(crate) struct LocateDocumentOptions<'selection, R> {
    pub types: &'selection OntologySelection,
    pub limits: LocateLimits,
    pub resolver: R,
}

#[derive(Debug)]
pub(crate) enum LocateDocumentError {
    /// The request exceeds the configured type-count limit.
    Types { count: usize, maximum: u32 },
    /// The source does not name a visible, placed node in the captured scene.
    UnknownEntity,
    /// A delivered node has no identity, position or delivery zoom in the captured scene.
    Node { row: NodeRowId },
    /// A resolved node has no captured display payload.
    NodeDisplay { row: NodeRowId },
    /// A resolved link has no captured display payload.
    LinkDisplay { row: EdgeRowId },
    /// The resolver failed to read the requested details.
    Hydrate,
}

impl fmt::Display for LocateDocumentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Types { count, maximum } => write!(
                fmt,
                "the request lists {count} colored type ids, exceeding the limit of {maximum}"
            ),
            Self::UnknownEntity => fmt.write_str("the source does not name a visible node"),
            Self::Node { row } => write!(
                fmt,
                "delivered node {row} has no identity, position or delivery zoom"
            ),
            Self::NodeDisplay { row } => write!(fmt, "resolved node {row} has no display payload"),
            Self::LinkDisplay { row } => write!(fmt, "resolved link {row} has no display payload"),
            Self::Hydrate => fmt.write_str("locate detail resolution failed"),
        }
    }
}

impl Error for LocateDocumentError {}

/// A source-first node set, identity-ordered edges and mandatory hydrated details.
///
/// Partners occur once, ordered by encoded node row. Truncation selects edges by squared distance
/// to the partner, then the partner's first delivery zoom, then link identity.
pub(crate) struct LocateDocument<'details> {
    generation: GenerationId,
    coordinate: MortonTile,
    entity_id: ArchivedEntityId,
    complete: bool,
    positions: IdVec<NodeSlot, Vec2>,
    ids: IdVec<NodeSlot, EncodedRowId<NodeRowId>>,
    type_masks: Option<TypeMasks<NodeSlot>>,
    edge_ids: IdVec<EdgeSlot, ArchivedEntityId>,
    edge_sources: IdVec<EdgeSlot, EncodedRowId<NodeRowId>>,
    edge_targets: IdVec<EdgeSlot, EncodedRowId<NodeRowId>>,
    trailer: LocateTrailer<'details>,
}

impl<'details> LocateDocument<'details> {
    /// Builds the visible ego graph and resolves its detail columns.
    ///
    /// Missing, withdrawn and hidden sources receive the same error. Draft identities also read
    /// absent. Labels come from the captured scene and remain empty for entities the resolver no
    /// longer serves. Property hydration uses the scene mask's actor.
    ///
    /// An empty type selection omits the mask column. Unknown types and nodes outside the fitted
    /// position domain have zero bits.
    ///
    /// # Errors
    ///
    /// Returns [`LocateDocumentError`] for an invalid type count, unavailable source or incomplete
    /// captured data, and for failed hydration.
    pub(crate) fn new<R: LocateResolver>(
        scene @ Scene {
            world, epoch, mask, ..
        }: Scene<'details>,
        source: LocateSource,
        LocateDocumentOptions {
            types,
            limits,
            resolver,
        }: &LocateDocumentOptions<'_, R>,
    ) -> Result<Self, Report<LocateDocumentError>> {
        if types.len() > limits.colored_type_ids as usize {
            return Err(Report::new(LocateDocumentError::Types {
                count: types.len(),
                maximum: limits.colored_type_ids,
            }));
        }

        let source = SourcePoint::new(scene, source)
            .ok_or_else(|| Report::new(LocateDocumentError::UnknownEntity))?;
        let subgraph = LocateSubgraph::new(scene, source, limits.edges as usize)?;

        let mut positions = IdVec::with_capacity(subgraph.nodes.len());
        let mut ids = IdVec::with_capacity(subgraph.nodes.len());
        let mut nodes = IdVec::with_capacity(subgraph.nodes.len());

        for &row in &subgraph.nodes {
            nodes.push(LocateEntity::new(
                world
                    .layout
                    .index
                    .key_of(epoch, row)
                    .ok_or_else(|| Report::new(LocateDocumentError::Node { row }))?,
            ));
            positions.push(
                world
                    .layout
                    .position(epoch, row)
                    .ok_or_else(|| Report::new(LocateDocumentError::Node { row }))?,
            );
            ids.push(world.layout.index.encode(row));
        }

        let type_masks = (!types.is_empty())
            .then(|| TypeMasks::new(scene, subgraph.nodes.iter().copied(), types));

        let mut edge_ids = IdVec::with_capacity(subgraph.edges.len());
        let mut edge_sources = IdVec::with_capacity(subgraph.edges.len());
        let mut edge_targets = IdVec::with_capacity(subgraph.edges.len());

        for &DeliveredEdge {
            row: _,
            endpoints: [source, target],
            identity,
        } in &subgraph.edges
        {
            edge_ids.push(identity);
            edge_sources.push(world.layout.index.encode(source));
            edge_targets.push(world.layout.index.encode(target));
        }

        let mut links: IdVec<_, _> = edge_ids.iter().copied().map(LocateEntity::new).collect();
        let source_properties = resolver
            .resolve(LocateRequest {
                actor: mask.actor(),
                nodes: &mut nodes,
                links: &mut links,
                properties: limits.properties,
                link_type_ids: limits.link_type_ids,
                link_properties: limits.link_properties,
            })
            .change_context(LocateDocumentError::Hydrate)?;
        let trailer = LocateTrailer::new(
            scene,
            &subgraph,
            types,
            LocateResponse {
                nodes,
                links,
                source_properties,
            },
        )?;

        Ok(Self {
            generation: world.generation().id(),
            coordinate: subgraph.source.cell,
            entity_id: subgraph.source.identity,
            complete: subgraph.complete,
            positions,
            ids,
            type_masks,
            edge_ids,
            edge_sources,
            edge_targets,
            trailer,
        })
    }
}

impl Document for LocateDocument<'_> {
    type Error = !;

    fn encode<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Result<Envelope, Self::Error> {
        Ok(self::codec::LocateResponse {
            variant: 0,
            document: self,
        }
        .encode_into(buffer))
    }
}
