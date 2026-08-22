//! The extracted per-query states, the gathered estimand data, and the shared projection plan.

use std::collections::HashMap;

use hashql_core::id::IdSlice;
use type_system::knowledge::entity::EntityId;

use super::{
    Pair,
    extract::GenerationColumns,
    population::{Arrival, ArrivalClass, IncidentStats, Novelty, StablePair},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    identity::NodeRowId,
    math::{AlignedVecN, MatrixN, Vec2},
};

/// One sampled arrival's extracted state in the entity estimand.
pub(super) struct QueryState {
    /// The arrival's entity identity.
    pub entity: EntityId,
    /// Whether the arrival's representation bytes occur in `G0`.
    pub novelty: Novelty,
    /// The arrival's fitted `G1` wire coordinate: the refit ordering's query point.
    pub refit_wire: Vec2,
    /// The arrival's incident-edge readings.
    pub incident: IncidentStats,
    /// The arrival's slot in the projection plan.
    pub slot: usize,
}

/// One sampled arrival class's extracted state in the class estimand.
pub(super) struct ClassQueryState {
    /// The class representative's entity identity.
    pub entity: EntityId,
    /// The class's member count in the full arrival population.
    pub members: usize,
    /// The class's shared novelty.
    pub novelty: Novelty,
    /// The representative's fitted `G1` wire coordinate.
    pub refit_wire: Vec2,
    /// The representative's incident-edge readings.
    pub incident: IncidentStats,
    /// The representative's slot in the projection plan.
    pub slot: usize,
}

/// One sampled control class's extracted identity.
pub(super) struct ClassControlState {
    /// The class representative's entity identity.
    pub entity: EntityId,
    /// The class's member count in the full stable population.
    pub members: usize,
}

/// One estimand's gathered universe and control data, copied out of the columns.
pub(super) struct EstimandData {
    /// The universe members' embeddings, in universe order.
    universe_embeddings: MatrixN<PROJECTOR_DIMENSIONS>,
    /// The universe members' wire coordinates, one column per generation.
    universe_wire: Pair<Vec<Vec2>>,
    /// The controls' embeddings, in control order.
    control_embeddings: MatrixN<PROJECTOR_DIMENSIONS>,
    /// The controls' earlier-generation wire coordinates.
    control_earlier_wire: Vec<Vec2>,
}

impl EstimandData {
    /// Gathers one estimand's universe and control data from the columns.
    ///
    /// Each pair sequence is consumed in one pass that fills its embedding matrix and its wire
    /// columns together, and no intermediate pair collection is materialized.
    ///
    /// # Panics
    ///
    /// This fires when a sequence declares an exact length whose embedding matrix layout cannot
    /// fit `isize`, since the matrix is allocated from that declared length before any of its
    /// pairs is consumed. It also fires when a pair sequence yields fewer items than its
    /// declared exact length, so a short sequence cannot leave silently zeroed embedding rows
    /// behind. The pair indexes must stay inside their columns as well: every pair's
    /// `earlier_row` lies inside the earlier wire column while its `later_row` lies inside the
    /// representation column, and only a universe pair's `later_row` reaches the later wire
    /// column.
    pub(super) fn gathered(
        universe: impl ExactSizeIterator<Item = StablePair>,
        controls: impl ExactSizeIterator<Item = StablePair>,
        wire_of_row: &Pair<&IdSlice<NodeRowId, Vec2>>,
        representations: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    ) -> Self {
        let universe_count = universe.len();
        let mut universe_embeddings = MatrixN::zeroed(universe_count);
        let mut universe_earlier_wire = Vec::with_capacity(universe_count);
        let mut universe_later_wire = Vec::with_capacity(universe_count);
        for (slot, pair) in universe_embeddings.rows_mut().iter_mut().zip(universe) {
            slot.copy_from(&representations[pair.later_row]);
            universe_earlier_wire.push(wire_of_row.earlier[pair.earlier_row]);
            universe_later_wire.push(wire_of_row.later[pair.later_row]);
        }
        assert_eq!(
            universe_earlier_wire.len(),
            universe_count,
            "every allocated universe row must be filled"
        );

        let control_count = controls.len();
        let mut control_embeddings = MatrixN::zeroed(control_count);
        let mut control_earlier_wire = Vec::with_capacity(control_count);
        for (slot, pair) in control_embeddings.rows_mut().iter_mut().zip(controls) {
            slot.copy_from(&representations[pair.later_row]);
            control_earlier_wire.push(wire_of_row.earlier[pair.earlier_row]);
        }
        assert_eq!(
            control_earlier_wire.len(),
            control_count,
            "every allocated control row must be filled"
        );

        Self {
            universe_embeddings,
            universe_wire: Pair {
                earlier: universe_earlier_wire,
                later: universe_later_wire,
            },
            control_embeddings,
            control_earlier_wire,
        }
    }

    /// The universe members' embeddings, in universe order.
    pub(super) const fn universe_embeddings(&self) -> &MatrixN<PROJECTOR_DIMENSIONS> {
        &self.universe_embeddings
    }

    /// The universe members' wire coordinates, one column per generation.
    pub(super) const fn universe_wire(&self) -> &Pair<Vec<Vec2>> {
        &self.universe_wire
    }

    /// The controls' embeddings, in control order.
    pub(super) const fn control_embeddings(&self) -> &MatrixN<PROJECTOR_DIMENSIONS> {
        &self.control_embeddings
    }

    /// The controls' earlier-generation wire coordinates.
    pub(super) const fn control_earlier_wire(&self) -> &[Vec2] {
        &self.control_earlier_wire
    }
}

impl QueryState {
    /// Builds the sampled arrivals' states in draw order.
    pub(super) fn sampled(
        query_draw: &[usize],
        arrivals: &[Arrival],
        later: &GenerationColumns<'_>,
        incident: &HashMap<NodeRowId, IncidentStats>,
        plan: &ProjectionPlan,
    ) -> impl IntoIterator<Item = Self> {
        query_draw.iter().map(|&draw| {
            let arrival = &arrivals[draw];
            Self {
                entity: later.ids()[arrival.later_row].into(),
                novelty: arrival.novelty,
                refit_wire: later.wire_of_row()[arrival.later_row],
                incident: incident[&arrival.later_row],
                slot: plan.slot(arrival.later_row),
            }
        })
    }
}

impl ClassQueryState {
    /// Builds the sampled arrival classes' states in draw order.
    pub(super) fn sampled(
        class_query_draw: &[usize],
        classes: &[ArrivalClass],
        later: &GenerationColumns<'_>,
        incident: &HashMap<NodeRowId, IncidentStats>,
        plan: &ProjectionPlan,
    ) -> impl IntoIterator<Item = Self> {
        class_query_draw.iter().map(|&draw| {
            let class = &classes[draw];
            Self {
                entity: later.ids()[class.representative_row].into(),
                members: class.members,
                novelty: class.novelty,
                refit_wire: later.wire_of_row()[class.representative_row],
                incident: incident[&class.representative_row],
                slot: plan.slot(class.representative_row),
            }
        })
    }
}

/// The distinct rows both estimands project, each once.
///
/// An arrival row sampled by both estimands projects once, the way one deployment would place it
/// once, and both estimands read that one outcome through their slots.
pub(super) struct ProjectionPlan {
    /// The distinct rows' embeddings, ascending by later row.
    embeddings: MatrixN<PROJECTOR_DIMENSIONS>,
    /// The projection slot per later row.
    slot_of_row: HashMap<NodeRowId, usize>,
    /// The distinct later rows, ascending.
    rows: Vec<NodeRowId>,
}

impl ProjectionPlan {
    /// Plans one projection over the union of both estimands' sampled rows.
    pub(super) fn new(
        entity_rows: impl IntoIterator<Item = NodeRowId>,
        class_rows: impl IntoIterator<Item = NodeRowId>,
        representations: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    ) -> Self {
        let mut rows: Vec<NodeRowId> = entity_rows.into_iter().chain(class_rows).collect();
        rows.sort_unstable();
        rows.dedup();

        let slot_of_row = rows
            .iter()
            .enumerate()
            .map(|(slot, &row)| (row, slot))
            .collect();
        let embeddings = MatrixN::from_rows(rows.iter().map(|&row| &representations[row]));

        Self {
            embeddings,
            slot_of_row,
            rows,
        }
    }

    /// The projection slot of one planned row.
    ///
    /// # Panics
    ///
    /// This panics when the row was never planned, which construction rules out for every
    /// sampled row.
    pub(super) fn slot(&self, row: NodeRowId) -> usize {
        self.slot_of_row[&row]
    }

    /// The planned rows' embeddings, in slot order.
    pub(super) const fn embeddings(&self) -> &MatrixN<PROJECTOR_DIMENSIONS> {
        &self.embeddings
    }

    /// The distinct planned rows, ascending, one per slot.
    pub(super) const fn rows(&self) -> &[NodeRowId] {
        &self.rows
    }
}
