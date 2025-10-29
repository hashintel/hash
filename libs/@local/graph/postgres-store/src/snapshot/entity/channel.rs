use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use error_stack::{Report, ResultExt as _};
use futures::{
    Sink, SinkExt as _, Stream, StreamExt as _,
    channel::mpsc::{self, Receiver, Sender},
    stream::{BoxStream, SelectAll, select_all},
};
use hash_graph_store::subgraph::edges::{EdgeDirection, EntityTraversalEdgeKind};
use type_system::{
    knowledge::{Entity, property::metadata::PropertyProvenance},
    ontology::{InheritanceDepth, entity_type::EntityTypeUuid},
};

use crate::{
    snapshot::{SnapshotRestoreError, entity::EntityRowBatch},
    store::postgres::query::rows::{
        EntityDraftRow, EntityEdgeRow, EntityEditionRow, EntityEmbeddingRow, EntityIdRow,
        EntityIsOfTypeRow, EntityTemporalMetadataRow,
    },
};

/// A sink to insert [`Entity`]s.
///
/// An `EntitySender` with the corresponding [`EntityReceiver`] are created using the [`channel`]
/// function.
#[derive(Debug, Clone)]
pub struct EntitySender {
    id: Sender<EntityIdRow>,
    draft: Sender<EntityDraftRow>,
    edition: Sender<EntityEditionRow>,
    is_of_type: Sender<EntityIsOfTypeRow>,
    temporal_metadata: Sender<EntityTemporalMetadataRow>,
    entity_edge: Sender<EntityEdgeRow>,
}

// This is a direct wrapper around several `Sink<mpsc::Sender>` and `AccountSender` with
// error-handling added to make it easier to use. It's taking an `EntitySnapshotRecord` and
// sending the individual rows to the corresponding sinks.
impl Sink<Entity> for EntitySender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll id sender")?;
        ready!(self.draft.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll draft sender")?;
        ready!(self.edition.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll edition sender")?;
        ready!(self.is_of_type.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll type sender")?;
        ready!(self.temporal_metadata.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll temporal metadata sender")?;
        ready!(self.entity_edge.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll entity edge sender")?;

        Poll::Ready(Ok(()))
    }

    #[expect(clippy::too_many_lines)]
    fn start_send(mut self: Pin<&mut Self>, entity: Entity) -> Result<(), Self::Error> {
        self.id
            .start_send_unpin(EntityIdRow {
                web_id: entity.metadata.record_id.entity_id.web_id,
                entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                provenance: entity.metadata.provenance.inferred,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach("could not send entity id")?;

        if let Some(draft_id) = entity.metadata.record_id.entity_id.draft_id {
            self.draft
                .start_send_unpin(EntityDraftRow {
                    web_id: entity.metadata.record_id.entity_id.web_id,
                    entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                    draft_id,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send entity draft id")?;
        }

        self.edition
            .start_send_unpin(EntityEditionRow {
                entity_edition_id: entity.metadata.record_id.edition_id,
                properties: entity.properties,
                archived: entity.metadata.archived,
                confidence: entity.metadata.confidence,
                provenance: entity.metadata.provenance.edition,
                property_metadata: entity.metadata.properties,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach("could not send entity edition")?;

        for is_of_type in &entity.metadata.entity_type_ids {
            self.is_of_type
                .start_send_unpin(EntityIsOfTypeRow {
                    entity_edition_id: entity.metadata.record_id.edition_id,
                    entity_type_ontology_id: EntityTypeUuid::from_url(is_of_type),
                    inheritance_depth: InheritanceDepth::new(0),
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send entity type")?;
        }

        self.temporal_metadata
            .start_send_unpin(EntityTemporalMetadataRow {
                web_id: entity.metadata.record_id.entity_id.web_id,
                entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                draft_id: entity.metadata.record_id.entity_id.draft_id,
                entity_edition_id: entity.metadata.record_id.edition_id,
                decision_time: entity.metadata.temporal_versioning.decision_time,
                transaction_time: entity.metadata.temporal_versioning.transaction_time,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach("could not send entity temporal metadata")?;

        if let Some(link_data) = entity.link_data {
            self.entity_edge
                .start_send_unpin(EntityEdgeRow {
                    source_web_id: entity.metadata.record_id.entity_id.web_id,
                    source_entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                    target_web_id: link_data.left_entity_id.web_id,
                    target_entity_uuid: link_data.left_entity_id.entity_uuid,
                    confidence: link_data.left_entity_confidence,
                    provenance: link_data.left_entity_provenance,
                    kind: EntityTraversalEdgeKind::HasLeftEntity,
                    direction: EdgeDirection::Outgoing,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send outgoing entity edge for left link")?;
            self.entity_edge
                .start_send_unpin(EntityEdgeRow {
                    source_web_id: link_data.left_entity_id.web_id,
                    source_entity_uuid: link_data.left_entity_id.entity_uuid,
                    target_web_id: entity.metadata.record_id.entity_id.web_id,
                    target_entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                    kind: EntityTraversalEdgeKind::HasLeftEntity,
                    direction: EdgeDirection::Incoming,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send incoming entity edge for left link")?;

            self.entity_edge
                .start_send_unpin(EntityEdgeRow {
                    source_web_id: entity.metadata.record_id.entity_id.web_id,
                    source_entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                    target_web_id: link_data.right_entity_id.web_id,
                    target_entity_uuid: link_data.right_entity_id.entity_uuid,
                    confidence: link_data.right_entity_confidence,
                    provenance: link_data.right_entity_provenance,
                    kind: EntityTraversalEdgeKind::HasRightEntity,
                    direction: EdgeDirection::Outgoing,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send outgoing entity edge for right link")?;
            self.entity_edge
                .start_send_unpin(EntityEdgeRow {
                    source_web_id: link_data.right_entity_id.web_id,
                    source_entity_uuid: link_data.right_entity_id.entity_uuid,
                    target_web_id: entity.metadata.record_id.entity_id.web_id,
                    target_entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                    kind: EntityTraversalEdgeKind::HasRightEntity,
                    direction: EdgeDirection::Incoming,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send incoming entity edge for right link")?;
        }

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush id sender")?;
        ready!(self.draft.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush draft sender")?;
        ready!(self.edition.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush edition sender")?;
        ready!(self.is_of_type.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush type sender")?;
        ready!(self.temporal_metadata.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush temporal metadata sender")?;
        ready!(self.entity_edge.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush entity edge sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close id sender")?;
        ready!(self.draft.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close draft sender")?;
        ready!(self.edition.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close edition sender")?;
        ready!(self.is_of_type.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close type sender")?;
        ready!(self.temporal_metadata.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close temporal metadata sender")?;
        ready!(self.entity_edge.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close entity edge sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to emit [`EntityRowBatch`]es.
///
/// An [`EntitySender`] with the corresponding `EntityReceiver` are created using the [`channel`]
/// function.
pub struct EntityReceiver {
    stream: SelectAll<BoxStream<'static, EntityRowBatch>>,
}

// This is a direct wrapper around the underlying stream, batches the row in chunks, and unifies
// the `Item` into a single enumeration.
impl Stream for EntityReceiver {
    type Item = EntityRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Creates a new [`EntitySender`] and [`EntityReceiver`] pair.
///
/// The `chunk_size` parameter determines the number of rows that are sent in a single
/// [`EntityRowBatch`].
pub(crate) fn channel(
    chunk_size: usize,
    embedding_rx: Receiver<EntityEmbeddingRow>,
) -> (EntitySender, EntityReceiver) {
    let (id_tx, id_rx) = mpsc::channel(chunk_size);
    let (draft_tx, draft_rx) = mpsc::channel(chunk_size);
    let (edition_tx, edition_rx) = mpsc::channel(chunk_size);
    let (type_tx, type_rx) = mpsc::channel(chunk_size);
    let (temporal_metadata_tx, temporal_metadata_rx) = mpsc::channel(chunk_size);
    let (entity_edge_tx, entity_edge_rx) = mpsc::channel(chunk_size);

    (
        EntitySender {
            id: id_tx,
            draft: draft_tx,
            edition: edition_tx,
            is_of_type: type_tx,
            temporal_metadata: temporal_metadata_tx,
            entity_edge: entity_edge_tx,
        },
        EntityReceiver {
            stream: select_all([
                id_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Ids)
                    .boxed(),
                draft_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Drafts)
                    .boxed(),
                edition_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Editions)
                    .boxed(),
                type_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Type)
                    .boxed(),
                temporal_metadata_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::TemporalMetadata)
                    .boxed(),
                entity_edge_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::EntityEdges)
                    .boxed(),
                embedding_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Embeddings)
                    .boxed(),
            ]),
        },
    )
}
