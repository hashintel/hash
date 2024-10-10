use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use authorization::schema::EntityRelationAndSubject;
use error_stack::{Report, ResultExt};
use futures::{
    Sink, SinkExt, Stream, StreamExt,
    channel::mpsc::{self, Receiver, Sender},
    stream::{BoxStream, SelectAll, select_all},
};
use graph_types::knowledge::entity::EntityUuid;
use type_system::schema::EntityTypeUuid;

use crate::{
    snapshot::{EntitySnapshotRecord, SnapshotRestoreError, entity::EntityRowBatch},
    store::postgres::query::rows::{
        EntityDraftRow, EntityEditionRow, EntityEmbeddingRow, EntityHasLeftEntityRow,
        EntityHasRightEntityRow, EntityIdRow, EntityIsOfTypeRow, EntityTemporalMetadataRow,
    },
};

/// A sink to insert [`EntitySnapshotRecord`]s.
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
    left_links: Sender<EntityHasLeftEntityRow>,
    right_links: Sender<EntityHasRightEntityRow>,
}

// This is a direct wrapper around several `Sink<mpsc::Sender>` and `AccountSender` with
// error-handling added to make it easier to use. It's taking an `EntitySnapshotRecord` and
// sending the individual rows to the corresponding sinks.
impl Sink<EntitySnapshotRecord> for EntitySender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll id sender")?;
        ready!(self.draft.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll draft sender")?;
        ready!(self.edition.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll edition sender")?;
        ready!(self.is_of_type.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll type sender")?;
        ready!(self.temporal_metadata.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll temporal metadata sender")?;
        ready!(self.left_links.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll left entity link edges sender")?;
        ready!(self.right_links.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll right entity link edges sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        entity: EntitySnapshotRecord,
    ) -> Result<(), Self::Error> {
        self.id
            .start_send_unpin(EntityIdRow {
                web_id: entity.metadata.record_id.entity_id.owned_by_id,
                entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                provenance: entity.metadata.provenance.inferred,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send entity id")?;

        if let Some(draft_id) = entity.metadata.record_id.entity_id.draft_id {
            self.draft
                .start_send_unpin(EntityDraftRow {
                    web_id: entity.metadata.record_id.entity_id.owned_by_id,
                    entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                    draft_id,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send entity draft id")?;
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
            .attach_printable("could not send entity edition")?;

        for is_of_type in &entity.metadata.entity_type_ids {
            self.is_of_type
                .start_send_unpin(EntityIsOfTypeRow {
                    entity_edition_id: entity.metadata.record_id.edition_id,
                    entity_type_ontology_id: EntityTypeUuid::from_url(is_of_type),
                })
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send entity type")?;
        }

        self.temporal_metadata
            .start_send_unpin(EntityTemporalMetadataRow {
                web_id: entity.metadata.record_id.entity_id.owned_by_id,
                entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                draft_id: entity.metadata.record_id.entity_id.draft_id,
                entity_edition_id: entity.metadata.record_id.edition_id,
                decision_time: entity.metadata.temporal_versioning.decision_time,
                transaction_time: entity.metadata.temporal_versioning.transaction_time,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send entity temporal metadata")?;

        if let Some(link_data) = entity.link_data {
            self.left_links
                .start_send_unpin(EntityHasLeftEntityRow {
                    web_id: entity.metadata.record_id.entity_id.owned_by_id,
                    entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                    left_web_id: link_data.left_entity_id.owned_by_id,
                    left_entity_uuid: link_data.left_entity_id.entity_uuid,
                    confidence: link_data.left_entity_confidence,
                    provenance: link_data.left_entity_provenance,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send entity link edges")?;
            self.right_links
                .start_send_unpin(EntityHasRightEntityRow {
                    web_id: entity.metadata.record_id.entity_id.owned_by_id,
                    entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                    right_web_id: link_data.right_entity_id.owned_by_id,
                    right_entity_uuid: link_data.right_entity_id.entity_uuid,
                    confidence: link_data.right_entity_confidence,
                    provenance: link_data.right_entity_provenance,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send entity link edges")?;
        }

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush id sender")?;
        ready!(self.draft.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush draft sender")?;
        ready!(self.edition.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush edition sender")?;
        ready!(self.is_of_type.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush type sender")?;
        ready!(self.temporal_metadata.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush temporal metadata sender")?;
        ready!(self.left_links.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush left entity link edges sender")?;
        ready!(self.right_links.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush right entity link edges sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close id sender")?;
        ready!(self.draft.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close draft sender")?;
        ready!(self.edition.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close edition sender")?;
        ready!(self.is_of_type.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close type sender")?;
        ready!(self.temporal_metadata.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close temporal metadata sender")?;
        ready!(self.left_links.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close entity link edges sender")?;
        ready!(self.right_links.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close entity link edges sender")?;

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
    relation_rx: Receiver<(EntityUuid, EntityRelationAndSubject)>,
    embedding_rx: Receiver<EntityEmbeddingRow>,
) -> (EntitySender, EntityReceiver) {
    let (id_tx, id_rx) = mpsc::channel(chunk_size);
    let (draft_tx, draft_rx) = mpsc::channel(chunk_size);
    let (edition_tx, edition_rx) = mpsc::channel(chunk_size);
    let (type_tx, type_rx) = mpsc::channel(chunk_size);
    let (temporal_metadata_tx, temporal_metadata_rx) = mpsc::channel(chunk_size);
    let (left_links_tx, left_links_rx) = mpsc::channel(chunk_size);
    let (right_links_tx, right_links_rx) = mpsc::channel(chunk_size);

    (
        EntitySender {
            id: id_tx,
            draft: draft_tx,
            edition: edition_tx,
            is_of_type: type_tx,
            temporal_metadata: temporal_metadata_tx,
            left_links: left_links_tx,
            right_links: right_links_tx,
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
                left_links_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::LeftLinks)
                    .boxed(),
                right_links_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::RightLinks)
                    .boxed(),
                relation_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Relations)
                    .boxed(),
                embedding_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Embeddings)
                    .boxed(),
            ]),
        },
    )
}
