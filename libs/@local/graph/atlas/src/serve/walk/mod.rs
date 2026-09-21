//! Delivery from a captured schedule with the rows the supplied epoch refuses removed.
//!
//! A [`Walk`] pairs a [`DeliverySchedule`] with the [`NodeIndex`] its rows address. Each query
//! subtracts the scheduled rows the supplied epoch's identity state does not permit, keeping every
//! bucket run contiguous and its count exact. A refused row is one the epoch has withdrawn or, for
//! an added row, one outside that epoch's allocated domain.

use super::{
    delta::{epoch::Epoch, overlay::NaiveIdentityProvider},
    schedule::{DeliveredNodes, DeliverySchedule},
    world::NodeIndex,
};
use crate::{
    identity::NodeRowId,
    morton::{MortonCell, Zoom},
};

#[cfg(test)]
mod tests;

/// Removes each row `withdrawn` accepts from `rows` in place.
///
/// The caller passes `runs` that partition `rows`, their lengths summing to the row count. Each
/// run's surviving rows remain contiguous, and its count updates.
///
/// # Panics
///
/// Panics if a computed run range extends past the end of `rows`.
fn subtract(
    DeliveredNodes { rows, runs, .. }: &mut DeliveredNodes,
    mut withdrawn: impl FnMut(NodeRowId) -> bool,
) {
    let mut kept = 0;
    let mut start = 0;

    for run in &mut *runs {
        let end = start + *run;
        let mut survivors = 0;

        for index in start..end {
            let node = rows[index];

            if !withdrawn(node) {
                rows[kept] = node;
                kept += 1;
                survivors += 1;
            }
        }

        *run = survivors;
        start = end;
    }

    debug_assert_eq!(
        start,
        rows.len(),
        "the runs should partition the delivered rows"
    );
    rows.truncate(kept);
}

/// A captured delivery schedule read through the identity state of a supplied epoch.
///
/// Scoped schedules contain only their admitted placements. Corpus schedules retain recorded base
/// rows through withdrawals. Both modes apply the epoch check without another visibility mask.
#[derive(Copy, Clone)]
pub(crate) struct Walk<'context> {
    /// The captured delivery schedule.
    pub schedule: DeliverySchedule<'context>,

    /// The node index that answers the withdrawal checks.
    pub index: &'context NodeIndex,
}

impl Walk<'_> {
    /// Returns whether `epoch`'s identity state refuses `node`.
    ///
    /// A refused row is withdrawn at that epoch or, for an added row, outside its allocated
    /// domain.
    ///
    /// # Panics
    ///
    /// Panics if `index` does not belong to `epoch`'s world.
    fn node_withdrawn(&self, epoch: &Epoch, node: NodeRowId) -> bool {
        !epoch
            .nodes(self.index)
            .bind(NaiveIdentityProvider::from_ref(&self.index.identity))
            .permits_row(node, None)
    }

    /// Gathers the rows `cell` newly delivers at `zoom`, minus the rows `epoch` refuses.
    ///
    /// # Panics
    ///
    /// Panics beyond the schedule's deepest served zoom, or if `index` does not belong to `epoch`'s
    /// world.
    pub(crate) fn delta(&self, epoch: &Epoch, zoom: Zoom, cell: MortonCell) -> DeliveredNodes {
        let mut delivered = self.schedule.delta(zoom, cell);
        subtract(&mut delivered, |node| self.node_withdrawn(epoch, node));
        delivered
    }

    /// Gathers `cell`'s cumulative rows through `zoom`, minus the rows `epoch` refuses.
    ///
    /// # Panics
    ///
    /// Panics beyond the schedule's deepest served zoom, or if `index` does not belong to `epoch`'s
    /// world.
    pub(crate) fn total(&self, epoch: &Epoch, zoom: Zoom, cell: MortonCell) -> DeliveredNodes {
        let mut delivered = self.schedule.total(zoom, cell);
        subtract(&mut delivered, |node| self.node_withdrawn(epoch, node));
        delivered
    }
}
