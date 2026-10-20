mod write;

use std::collections::{HashMap, HashSet};

use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, OpenTemporalBound, Timestamp,
    TransactionTime,
};
use type_system::{
    knowledge::{
        Entity,
        entity::{
            EntityId, EntityProvenance,
            id::{DraftId, EntityEditionId},
        },
    },
    principal::actor::ActorId,
};
use uuid::Uuid;

use super::{history::EntityHistory, patch::DraftTransition};
use crate::store::postgres::query::rows::{EntityDraftRow, EntityTemporalMetadataRow};

/// Keeps intermediate editions alongside final temporal history so repeated patches can each
/// return their own result while their database updates are combined.
pub(crate) struct EntityPatchSet {
    history: EntityHistory,
    editions: HashMap<EntityEditionId, Entity>,
    changed: Vec<EntityEditionId>,
    drafts: Vec<EntityDraftRow>,
    publications: HashMap<EntityId, EntityProvenance>,
    archived: HashSet<EntityEditionId>,
}

const fn temporal_row(entity: &Entity) -> EntityTemporalMetadataRow {
    let id = entity.metadata.record_id.entity_id;
    EntityTemporalMetadataRow {
        web_id: id.web_id,
        entity_uuid: id.entity_uuid,
        draft_id: id.draft_id,
        entity_edition_id: entity.metadata.record_id.edition_id,
        decision_time: entity.metadata.temporal_versioning.decision_time,
        transaction_time: entity.metadata.temporal_versioning.transaction_time,
    }
}

impl EntityPatchSet {
    pub(super) fn new(rows: impl IntoIterator<Item = EntityTemporalMetadataRow>) -> Self {
        Self {
            history: EntityHistory::new(rows),
            editions: HashMap::new(),
            changed: Vec::new(),
            drafts: Vec::new(),
            publications: HashMap::new(),
            archived: HashSet::new(),
        }
    }

    /// Returns every edition created by the batch, including those superseded by later patches.
    pub(super) fn changed_entities(&self) -> impl Iterator<Item = &Entity> {
        self.changed.iter().map(|id| {
            self.editions
                .get(id)
                .expect("changed editions should be present")
        })
    }

    /// Places a prepared change into history using the entity's existing bounds as the interval
    /// to replace. Draft creation preserves live history; publication closes the live interval
    /// being superseded.
    pub(super) fn apply(
        &mut self,
        actor_id: ActorId,
        entity: &mut Entity,
        transition: DraftTransition,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) {
        let previous = temporal_row(entity);
        let id = &mut entity.metadata.record_id.entity_id;
        match transition {
            DraftTransition::Update => {}
            DraftTransition::Create => {
                let draft_id = DraftId::new(Uuid::new_v4());
                id.draft_id = Some(draft_id);
                self.drafts.push(EntityDraftRow {
                    web_id: id.web_id,
                    entity_uuid: id.entity_uuid,
                    draft_id,
                });
            }
            DraftTransition::Publish => {
                id.draft_id = None;
                if let Some(live) = self
                    .history
                    .get(*id, transaction_time, decision_time)
                    .cloned()
                {
                    self.history.close(&live, transaction_time, decision_time);
                    self.archived.insert(live.entity_edition_id);
                    if let Some(edition) = self.editions.get_mut(&live.entity_edition_id) {
                        edition.metadata.provenance.edition.archived_by_id = Some(actor_id.into());
                    }
                }
                let provenance = &mut entity.metadata.provenance;
                if provenance
                    .first_non_draft_created_at_decision_time
                    .is_none()
                {
                    provenance.first_non_draft_created_at_transaction_time = Some(transaction_time);
                    provenance.first_non_draft_created_at_decision_time = Some(decision_time);
                    self.publications.insert(*id, provenance.clone());
                }
            }
        }
        entity.metadata.record_id.edition_id = EntityEditionId::new(Uuid::new_v4());
        entity.metadata.temporal_versioning.transaction_time = LeftClosedTemporalInterval::new(
            ClosedTemporalBound::Inclusive(transaction_time),
            OpenTemporalBound::Unbounded,
        );
        entity.metadata.temporal_versioning.decision_time = LeftClosedTemporalInterval::new(
            ClosedTemporalBound::Inclusive(decision_time),
            if matches!(transition, DraftTransition::Create) {
                OpenTemporalBound::Unbounded
            } else {
                *previous.decision_time.end()
            },
        );
        if matches!(transition, DraftTransition::Create) {
            self.history.insert(temporal_row(entity));
        } else {
            self.history.replace(
                &previous,
                temporal_row(entity),
                transaction_time,
                decision_time,
            );
        }
        self.changed.push(entity.metadata.record_id.edition_id);
        self.editions
            .insert(entity.metadata.record_id.edition_id, entity.clone());
    }
}
