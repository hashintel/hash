use std::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use error_stack::{IntoReport, Report, ResultExt};
use futures::{
    channel::mpsc::{self, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};

use crate::{
    identifier::{
        ontology::OntologyTypeVersion,
        time::{ClosedTemporalBound, LeftClosedTemporalInterval, OpenTemporalBound, Timestamp},
    },
    provenance::RecordCreatedById,
    snapshot::{
        account::AccountSender,
        entity::{
            EntityEditionRow, EntityIdRow, EntityLinkEdgeRow, EntityRowBatch,
            EntityTemporalMetadataRow,
        },
        EntitySnapshotRecord, SnapshotRestoreError,
    },
};

/// A sink to insert [`EntitySnapshotRecord`]s.
///
/// An `EntitySender` with the corresponding [`EntityReceiver`] are created using the [`channel`]
/// function.
#[derive(Debug, Clone)]
pub struct EntitySender {
    account: AccountSender,
    id: Sender<EntityIdRow>,
    edition: Sender<EntityEditionRow>,
    temporal_metadata: Sender<EntityTemporalMetadataRow>,
    links: Sender<EntityLinkEdgeRow>,
}

// This is a direct wrapper around several `Sink<mpsc::Sender>` and `AccountSender` with
// error-handling added to make it easier to use. It's taking an `EntitySnapshotRecord` and
// sending the individual rows to the corresponding sinks.
impl Sink<EntitySnapshotRecord> for EntitySender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.account.poll_ready_unpin(cx))
            .attach_printable("could not poll account sender")?;
        ready!(self.id.poll_ready_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll id sender")?;
        ready!(self.edition.poll_ready_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll edition sender")?;
        ready!(self.temporal_metadata.poll_ready_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll temporal metadata sender")?;
        ready!(self.links.poll_ready_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll entity link edges sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        entity: EntitySnapshotRecord,
    ) -> Result<(), Self::Error> {
        self.account
            .start_send_unpin(
                entity
                    .metadata
                    .record_id
                    .entity_id
                    .owned_by_id
                    .as_account_id(),
            )
            .attach_printable("could not send account")?;

        self.id
            .start_send_unpin(EntityIdRow {
                owned_by_id: entity.metadata.record_id.entity_id.owned_by_id,
                entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
            })
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send entity id")?;

        self.edition
            .start_send_unpin(EntityEditionRow {
                entity_edition_id: entity.metadata.record_id.edition_id,
                properties: entity.properties,
                left_to_right_order: entity
                    .link_data
                    .and_then(|link_data| link_data.order.left_to_right),
                right_to_left_order: entity
                    .link_data
                    .and_then(|link_data| link_data.order.right_to_left),
                record_created_by_id: entity.metadata.custom.provenance.map_or_else(
                    || {
                        RecordCreatedById::new(
                            entity
                                .metadata
                                .record_id
                                .entity_id
                                .owned_by_id
                                .as_account_id(),
                        )
                    },
                    |p| p.record_created_by_id(),
                ),
                archived: entity.metadata.custom.archived.unwrap_or(false),
                entity_type_base_url: entity.metadata.entity_type_id.base_url.as_str().to_owned(),
                entity_type_version: OntologyTypeVersion::new(
                    entity.metadata.entity_type_id.version,
                ),
            })
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send entity edition")?;

        let (decision_time, transaction_time) = entity.metadata.temporal_versioning.map_or_else(
            || {
                let decision_time = LeftClosedTemporalInterval::new(
                    ClosedTemporalBound::Inclusive(Timestamp::UNIX_EPOCH),
                    OpenTemporalBound::Unbounded,
                );
                (decision_time, None)
            },
            |temporal_versioning| {
                (
                    temporal_versioning.decision_time,
                    Some(temporal_versioning.transaction_time),
                )
            },
        );

        self.temporal_metadata
            .start_send_unpin(EntityTemporalMetadataRow {
                owned_by_id: entity.metadata.record_id.entity_id.owned_by_id,
                entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                entity_edition_id: entity.metadata.record_id.edition_id,
                decision_time,
                transaction_time,
            })
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send entity temporal metadata")?;

        if let Some(link_data) = entity.link_data {
            self.links
                .start_send_unpin(EntityLinkEdgeRow {
                    owned_by_id: entity.metadata.record_id.entity_id.owned_by_id,
                    entity_uuid: entity.metadata.record_id.entity_id.entity_uuid,
                    left_owned_by_id: link_data.left_entity_id.owned_by_id,
                    left_entity_uuid: link_data.left_entity_id.entity_uuid,
                    right_owned_by_id: link_data.right_entity_id.owned_by_id,
                    right_entity_uuid: link_data.right_entity_id.entity_uuid,
                })
                .into_report()
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send entity link edges")?;
        }

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.account.poll_flush_unpin(cx))
            .attach_printable("could not flush account sender")?;
        ready!(self.id.poll_flush_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush id sender")?;
        ready!(self.edition.poll_flush_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush edition sender")?;
        ready!(self.temporal_metadata.poll_flush_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush temporal metadata sender")?;
        ready!(self.links.poll_flush_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush entity link edges sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.account.poll_close_unpin(cx))
            .attach_printable("could not close account sender")?;
        ready!(self.id.poll_close_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close id sender")?;
        ready!(self.edition.poll_close_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close edition sender")?;
        ready!(self.temporal_metadata.poll_close_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close temporal metadata sender")?;
        ready!(self.links.poll_close_unpin(cx))
            .into_report()
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
pub fn channel(chunk_size: usize, account_sender: AccountSender) -> (EntitySender, EntityReceiver) {
    let (id_tx, id_rx) = mpsc::channel(chunk_size);
    let (edition_tx, edition_rx) = mpsc::channel(chunk_size);
    let (temporal_metadata_tx, temporal_metadata_rx) = mpsc::channel(chunk_size);
    let (left_entity_tx, left_entity_rx) = mpsc::channel(chunk_size);

    (
        EntitySender {
            account: account_sender,
            id: id_tx,
            edition: edition_tx,
            temporal_metadata: temporal_metadata_tx,
            links: left_entity_tx,
        },
        EntityReceiver {
            stream: select_all([
                id_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Ids)
                    .boxed(),
                edition_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Editions)
                    .boxed(),
                temporal_metadata_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::TemporalMetadata)
                    .boxed(),
                left_entity_rx
                    .ready_chunks(chunk_size)
                    .map(EntityRowBatch::Links)
                    .boxed(),
            ]),
        },
    )
}
