use std::collections::HashMap;

use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, OpenTemporalBound, Timestamp,
    TransactionTime,
};
use type_system::knowledge::entity::{EntityId, id::EntityEditionId};

use crate::store::postgres::query::rows::EntityTemporalMetadataRow;

/// Carries a row's identity from the start of the batch through repeated edits so persistence can
/// update the original database row once.
struct TemporalEntry {
    row: EntityTemporalMetadataRow,
    original: Option<EntityTemporalMetadataRow>,
}

/// Tracks the final replacement or removal of each loaded row while retaining earlier history
/// across both time axes.
pub(crate) struct EntityHistory {
    current: HashMap<EntityId, Vec<TemporalEntry>>,
    removed: Vec<EntityTemporalMetadataRow>,
}

impl EntityHistory {
    pub(super) fn new(rows: impl IntoIterator<Item = EntityTemporalMetadataRow>) -> Self {
        let mut history = Self {
            current: HashMap::new(),
            removed: Vec::new(),
        };
        for row in rows {
            history.push(TemporalEntry {
                original: Some(row.clone()),
                row,
            });
        }
        history
    }

    /// An edition may appear in several intervals, so the same ID can occur more than once.
    pub(super) fn edition_ids(&self) -> impl Iterator<Item = EntityEditionId> {
        self.current
            .values()
            .flatten()
            .map(|entry| entry.row.entity_edition_id)
    }

    pub(super) fn get(
        &self,
        entity_id: EntityId,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Option<&EntityTemporalMetadataRow> {
        self.current
            .get(&entity_id)?
            .iter()
            .map(|entry| &entry.row)
            .find(|row| {
                row.transaction_time.contains_point(&transaction_time)
                    && row.decision_time.contains_point(&decision_time)
            })
    }

    fn push(&mut self, entry: TemporalEntry) {
        self.current
            .entry(EntityId {
                web_id: entry.row.web_id,
                entity_uuid: entry.row.entity_uuid,
                draft_id: entry.row.draft_id,
            })
            .or_default()
            .push(entry);
    }

    fn take(&mut self, row: &EntityTemporalMetadataRow) -> TemporalEntry {
        let entries = self
            .current
            .get_mut(&EntityId {
                web_id: row.web_id,
                entity_uuid: row.entity_uuid,
                draft_id: row.draft_id,
            })
            .expect("changed entity should have temporal history");
        let index = entries
            .iter()
            .position(|entry| entry.row == *row)
            .expect("changed temporal row should be present");
        entries.swap_remove(index)
    }

    pub(super) fn insert(&mut self, row: EntityTemporalMetadataRow) {
        self.push(TemporalEntry {
            row,
            original: None,
        });
    }

    /// Tracks membership in the batch even after every interval for an entity has been closed.
    pub(super) fn contains(&self, entity_id: EntityId) -> bool {
        self.current.contains_key(&entity_id)
    }

    /// Produces intervals that preserve earlier transaction snapshots and earlier decision-time
    /// states when a patch replaces the remainder of a row.
    fn split(
        row: &EntityTemporalMetadataRow,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Vec<EntityTemporalMetadataRow> {
        let mut fragments = Vec::with_capacity(2);
        let ClosedTemporalBound::Inclusive(transaction_start) = *row.transaction_time.start();
        if transaction_start < transaction_time {
            fragments.push(EntityTemporalMetadataRow {
                transaction_time: LeftClosedTemporalInterval::new(
                    ClosedTemporalBound::Inclusive(transaction_start),
                    OpenTemporalBound::Exclusive(transaction_time),
                ),
                ..row.clone()
            });
        }
        let ClosedTemporalBound::Inclusive(decision_start) = *row.decision_time.start();
        if decision_start < decision_time {
            fragments.push(EntityTemporalMetadataRow {
                transaction_time: LeftClosedTemporalInterval::new(
                    ClosedTemporalBound::Inclusive(transaction_time),
                    OpenTemporalBound::Unbounded,
                ),
                decision_time: LeftClosedTemporalInterval::new(
                    ClosedTemporalBound::Inclusive(decision_start),
                    OpenTemporalBound::Exclusive(decision_time),
                ),
                ..row.clone()
            });
        }
        fragments
    }

    /// Keeps the history before the patch on both time axes, then associates the edited interval
    /// with the same original row so repeated patches produce one final update.
    pub(super) fn replace(
        &mut self,
        previous: &EntityTemporalMetadataRow,
        row: EntityTemporalMetadataRow,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) {
        let mut entry = self.take(previous);
        for fragment in Self::split(previous, transaction_time, decision_time) {
            self.insert(fragment);
        }
        entry.row = row;
        self.push(entry);
    }

    /// Ends the live state that a published draft supersedes while retaining its past on both
    /// time axes. A row is deleted only when neither earlier interval survives.
    pub(super) fn close(
        &mut self,
        row: &EntityTemporalMetadataRow,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) {
        let mut entry = self.take(row);
        let mut fragments = Self::split(row, transaction_time, decision_time);
        if let Some(row) = fragments.pop() {
            entry.row = row;
            self.push(entry);
        } else {
            self.removed.extend(entry.original);
        }
        for fragment in fragments {
            self.insert(fragment);
        }
    }

    pub(super) fn removed(&self) -> impl Iterator<Item = &EntityTemporalMetadataRow> {
        self.removed.iter()
    }

    /// Pairs each changed persisted row with its final replacement. Repeated edits are combined
    /// so a bulk update never targets the same database row twice.
    pub(super) fn updated(
        &self,
    ) -> impl Iterator<Item = (&EntityTemporalMetadataRow, &EntityTemporalMetadataRow)> {
        self.current.values().flatten().filter_map(|entry| {
            let original = entry.original.as_ref()?;
            if *original == entry.row {
                return None;
            }
            Some((original, &entry.row))
        })
    }

    /// Includes fragments kept for historical reads as well as intervals for new editions.
    pub(super) fn inserted(&self) -> impl Iterator<Item = &EntityTemporalMetadataRow> {
        self.current
            .values()
            .flatten()
            .filter(|entry| entry.original.is_none())
            .map(|entry| &entry.row)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use hash_graph_temporal_versioning::{
        ClosedTemporalBound, LeftClosedTemporalInterval, OpenTemporalBound, Timestamp,
    };
    use type_system::{
        knowledge::entity::{
            EntityId,
            id::{EntityEditionId, EntityUuid},
        },
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::EntityHistory;
    use crate::store::postgres::query::rows::EntityTemporalMetadataRow;

    fn interval<A>(start: i64, end: Option<i64>) -> LeftClosedTemporalInterval<A> {
        LeftClosedTemporalInterval::new(
            ClosedTemporalBound::Inclusive(Timestamp::from_unix_timestamp(start)),
            end.map_or(OpenTemporalBound::Unbounded, |end| {
                OpenTemporalBound::Exclusive(Timestamp::from_unix_timestamp(end))
            }),
        )
    }

    fn row() -> EntityTemporalMetadataRow {
        EntityTemporalMetadataRow {
            web_id: WebId::new(Uuid::nil()),
            entity_uuid: EntityUuid::new(Uuid::nil()),
            draft_id: None,
            entity_edition_id: EntityEditionId::new(Uuid::nil()),
            decision_time: interval(0, None),
            transaction_time: interval(0, None),
        }
    }

    /// Checks history preservation and a single planned update of the original row.
    ///
    /// `decisions` contains replacement decision-time starts in application order. Each `expected`
    /// tuple is `(decision_start, decision_end, edition)` for rows visible from transaction time 10
    /// onward. Starts are inclusive, ends exclusive, and `None` means unbounded. Edition 0 is the
    /// original state; subsequent editions follow replacement order. The transaction snapshot
    /// `[0, 10)` is checked separately.
    #[test]
    fn repeated_row_decision_times() {
        for (decisions, expected) in [
            ([5, 5], vec![(0, Some(5), 0), (5, None, 2)]),
            ([3, 5], vec![(0, Some(3), 0), (3, Some(5), 1), (5, None, 2)]),
            ([5, 3], vec![(0, Some(3), 0), (3, Some(5), 2), (5, None, 1)]),
            ([0, 0], vec![(0, None, 2)]),
        ] {
            let original = row();
            let id = EntityId {
                web_id: original.web_id,
                entity_uuid: original.entity_uuid,
                draft_id: None,
            };
            let mut history = EntityHistory::new([original.clone()]);
            let transaction_time = Timestamp::from_unix_timestamp(10);
            for (index, decision) in decisions.into_iter().enumerate() {
                let decision_time = Timestamp::from_unix_timestamp(decision);
                let previous = history
                    .get(id, transaction_time, decision_time)
                    .expect("target row should exist")
                    .clone();
                history.replace(
                    &previous,
                    EntityTemporalMetadataRow {
                        entity_edition_id: EntityEditionId::new(Uuid::from_u128(index as u128 + 1)),
                        decision_time: LeftClosedTemporalInterval::new(
                            ClosedTemporalBound::Inclusive(decision_time),
                            *previous.decision_time.end(),
                        ),
                        transaction_time: interval(10, None),
                        ..previous.clone()
                    },
                    transaction_time,
                    decision_time,
                );
            }
            let mut expected_rows: HashSet<_> = expected
                .into_iter()
                .map(|(start, end, edition)| EntityTemporalMetadataRow {
                    entity_edition_id: EntityEditionId::new(Uuid::from_u128(edition)),
                    decision_time: interval(start, end),
                    transaction_time: interval(10, None),
                    ..original.clone()
                })
                .collect();
            expected_rows.insert(EntityTemporalMetadataRow {
                transaction_time: interval(0, Some(10)),
                ..original
            });
            assert_eq!(
                history
                    .current
                    .values()
                    .flatten()
                    .map(|entry| entry.row.clone())
                    .collect::<HashSet<_>>(),
                expected_rows,
                "should preserve the resolved history for {decisions:?}"
            );
            assert_eq!(
                history
                    .updated()
                    .map(|(original, _)| original)
                    .collect::<Vec<_>>(),
                vec![&original],
                "should update the original row once"
            );
            assert_eq!(
                history
                    .inserted()
                    .chain(history.updated().map(|(_, row)| row))
                    .cloned()
                    .collect::<HashSet<_>>(),
                expected_rows,
                "should persist only resolved rows"
            );
        }
    }

    #[test]
    fn close_same_transaction_start() {
        let original = row();
        let mut history = EntityHistory::new([original.clone()]);
        history.close(
            &original,
            Timestamp::from_unix_timestamp(0),
            Timestamp::from_unix_timestamp(0),
        );
        assert_eq!(
            history.inserted().count(),
            0,
            "should omit empty historical intervals"
        );
        assert_eq!(
            history.removed().count(),
            1,
            "should remove the superseded row"
        );
    }
}
