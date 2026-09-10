use error_stack::Report;
use hashql_core::id::IdVec;
use type_system::knowledge::entity::EntityId;

use super::{LocateDocumentError, LocateSource};
use crate::{
    identity::NodeRowId,
    math::Vec2,
    morton::{Depth, MortonKey, MortonTile},
    postgres::id::ArchivedEntityId,
    salt::lod::stage::WIRE_FRAME,
    serve::{
        hydrate::NodeSlot,
        neighbourhood::{DeliveredEdge, Neighbourhood},
        scene::Scene,
        visibility::Visible,
    },
};

pub(crate) struct SourcePoint {
    pub row: Visible<NodeRowId>,
    pub identity: ArchivedEntityId,
    pub position: Vec2,
    pub cell: MortonTile,
}

impl SourcePoint {
    pub(crate) fn new(
        Scene {
            world,
            epoch,
            mask,
            delivery,
            ..
        }: Scene<'_>,
        source: LocateSource,
    ) -> Option<Self> {
        let row = match source {
            LocateSource::Key(EntityId {
                web_id,
                entity_uuid,
                draft_id: None,
            }) => world.layout.index.row_of(
                epoch,
                ArchivedEntityId {
                    web_id: web_id.into(),
                    entity_uuid: entity_uuid.into(),
                },
            )?,
            LocateSource::Key(_) => return None,
            LocateSource::Row(row) => world.layout.index.decode(epoch, row)?,
        };

        let row = mask.visible_node(row)?;
        let identity = world.layout.index.key_of(epoch, row.unwrap())?;
        let position = world.layout.position(epoch, row.unwrap())?;
        let zoom = delivery.first_zoom(row.unwrap())?;
        let [x, y] = WIRE_FRAME.quantize(position);

        Some(Self {
            row,
            identity,
            position,
            cell: MortonKey::new(x, y).tile(Depth::from_zoom(zoom)),
        })
    }
}

/// A capped incident set with the source first and distinct partners in wire-id order.
pub(crate) struct LocateSubgraph {
    pub source: SourcePoint,
    pub nodes: IdVec<NodeSlot, NodeRowId>,
    pub edges: Vec<DeliveredEdge>,
    pub complete: bool,
}

impl LocateSubgraph {
    fn truncate_nearest(
        Scene {
            world,
            epoch,
            delivery,
            ..
        }: Scene<'_>,
        source: &SourcePoint,
        edges: &mut Vec<DeliveredEdge>,
        capacity: usize,
    ) -> Result<(), Report<LocateDocumentError>> {
        if capacity == 0 {
            edges.clear();
            return Ok(());
        }

        let mut ranked = Vec::with_capacity(edges.len());

        for edge in edges.drain(..) {
            let row = edge
                .partner_of(source.row.unwrap())
                .expect("an incident edge should contain the source");

            let position = world
                .layout
                .position(epoch, row)
                .ok_or_else(|| Report::new(LocateDocumentError::Node { row }))?;

            let zoom = delivery
                .first_zoom(row)
                .ok_or_else(|| Report::new(LocateDocumentError::Node { row }))?;

            let distance = position.distance_squared_wide(source.position);
            ranked.push(((distance, zoom, edge.identity), edge));
        }

        ranked.select_nth_unstable_by_key(capacity - 1, |&(key, _)| key);
        ranked.truncate(capacity);

        edges.extend(ranked.into_iter().map(|(_, edge)| edge));
        Ok(())
    }

    /// Selects incident edges and their distinct partners around `source`.
    ///
    /// # Errors
    ///
    /// Returns [`LocateDocumentError::Node`] when a partner has no captured position or delivery
    /// zoom.
    pub(crate) fn new(
        scene: Scene<'_>,
        source: SourcePoint,
        capacity: usize,
    ) -> Result<Self, Report<LocateDocumentError>> {
        let neighbourhood = Neighbourhood { provider: scene };
        let mut edges: Vec<_> = neighbourhood.incident(source.row.unwrap()).collect();

        let complete = edges.len() <= capacity;
        if !complete {
            Self::truncate_nearest(scene, &source, &mut edges, capacity)?;
        }
        edges.sort_unstable_by_key(|edge| edge.identity);

        let mut partners: Vec<_> = edges
            .iter()
            .flat_map(|edge| edge.endpoints)
            .filter(|&row| row != source.row.unwrap())
            .map(|row| (scene.world.layout.index.encode(row), row))
            .collect();
        partners.sort_unstable_by_key(|&(wire, _)| wire);
        partners.dedup_by_key(|&mut (wire, _)| wire);

        let mut nodes = IdVec::with_capacity(partners.len() + 1);
        nodes.push(source.row.unwrap());
        nodes.extend(partners.into_iter().map(|(_, row)| row));

        Ok(Self {
            source,
            nodes,
            edges,
            complete,
        })
    }
}
