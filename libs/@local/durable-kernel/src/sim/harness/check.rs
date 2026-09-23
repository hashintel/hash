use super::{Driver, DstEffect, DstEvent, ReferenceState, ScheduleCoverage};
use crate::{
    domain::EventRecord,
    ids::EffectId,
    properties::{self},
    registry::VersionedRecord as _,
    sim::SimKey,
};

impl Driver<'_> {
    pub(super) fn reference_fold(&self) -> ReferenceState {
        let mut reference = ReferenceState::default();
        for (_sequence, bytes) in self.journal.durable_entries(SimKey::Events) {
            let record = EventRecord::<DstEvent>::decode_borrowed(&bytes)
                .expect("durable simulation entries should decode")
                .normalize()
                .expect("durable simulation entries should normalize");
            if !reference.event_ids.insert(record.event_id()) {
                continue;
            }
            match record.into_event() {
                DstEvent::Increment {
                    counter, amount, ..
                } => {
                    *reference.totals.entry(counter).or_insert(0) += amount;
                }
                DstEvent::Archive {
                    counter,
                    upto,
                    cycle,
                } => {
                    reference.totals.insert(counter.clone(), 0);
                    *reference.archives.entry(counter.clone()).or_insert(0) += 1;
                    reference.archive_events.push(DstEffect {
                        counter,
                        upto,
                        cycle,
                    });
                }
            }
        }
        reference
    }

    pub(super) async fn finish_effects_and_check(&mut self, coverage: &mut ScheduleCoverage) {
        let mut turns = 0_u32;
        while self.effect_turn(coverage).await > 0 {
            turns += 1;
            properties::PENDING_EFFECTS_COMPLETE.check(
                turns <= self.effect_round_limit,
                format_args!("effects still pending after {turns} execution rounds"),
            );
        }

        let durable_end = self.journal.durable_end_exclusive();
        properties::DURABLE_END_MONOTONIC.check(
            durable_end >= self.last_durable_end,
            format_args!(
                "durable end decreased from {} to {durable_end}",
                self.last_durable_end
            ),
        );
        self.last_durable_end = durable_end;

        let reference = self.reference_fold();
        let projection = self.read_projection(coverage).await;
        properties::PROJECTION_IS_FOLD_OF_DURABLE_PREFIX.check(
            projection.totals == reference.totals && projection.archives == reference.archives,
            format_args!(
                "projection {projection:?} differs from the state rebuilt from the durable prefix"
            ),
        );
        for record in &self.acknowledged {
            properties::ACK_IMPLIES_DURABLE.check(
                reference.event_ids.contains(&record.event_id()),
                format_args!("acknowledged event {} is not durable", record.event_id()),
            );
            properties::ACKED_EVENT_SURVIVES_RECOVERY.check(
                reference.event_ids.contains(&record.event_id()),
                format_args!(
                    "acknowledged event {} did not survive recovery",
                    record.event_id()
                ),
            );
        }
        for rejected in &self.rejected {
            properties::REJECTED_NEVER_DURABLE.check(
                !reference.event_ids.contains(rejected),
                format_args!("rejected event {rejected} became durable"),
            );
        }
        for archive in &reference.archive_events {
            let identity = EffectId::for_effect(archive).expect("effect should serialize");
            properties::DURABLE_COMPLETION_IMPLIES_EXECUTED.check(
                self.executions.contains_key(&identity),
                format_args!(
                    "durable completion for {}@{} has no recorded execution",
                    archive.counter, archive.upto
                ),
            );
        }
        for durable in &reference.event_ids {
            properties::DURABLE_EVENTS_WERE_PROPOSED.check(
                self.proposed.contains(durable),
                format_args!("durable event {durable} was never proposed"),
            );
        }
    }
}
