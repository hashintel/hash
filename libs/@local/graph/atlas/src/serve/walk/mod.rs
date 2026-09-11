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

/// Subtracts the supplied epoch's withdrawals from a captured delivery schedule.
///
/// Scoped schedules contain only their admitted placements. Corpus schedules retain recorded base
/// rows through withdrawals. Both modes apply the epoch check without another visibility mask.
#[derive(Copy, Clone)]
pub(crate) struct Walk<'context> {
    pub schedule: DeliverySchedule<'context>,

    pub index: &'context NodeIndex,
}

impl Walk<'_> {
    fn node_withdrawn(&self, epoch: &Epoch, node: NodeRowId) -> bool {
        !epoch
            .nodes(self.index)
            .bind(NaiveIdentityProvider::from_ref(&self.index.identity))
            .permits_row(node, None)
    }

    pub(crate) fn delta(&self, epoch: &Epoch, zoom: Zoom, cell: MortonCell) -> DeliveredNodes {
        let mut delivered = self.schedule.delta(zoom, cell);
        subtract(&mut delivered, |node| self.node_withdrawn(epoch, node));
        delivered
    }

    pub(crate) fn total(&self, epoch: &Epoch, zoom: Zoom, cell: MortonCell) -> DeliveredNodes {
        let mut delivered = self.schedule.total(zoom, cell);
        subtract(&mut delivered, |node| self.node_withdrawn(epoch, node));
        delivered
    }
}
