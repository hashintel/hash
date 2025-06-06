use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use error_stack::{Report, ResultExt as _};
use futures::{
    Sink, SinkExt as _, Stream, StreamExt as _,
    channel::mpsc::{self, Sender},
    stream::{BoxStream, SelectAll, select_all},
};
use type_system::ontology::{
    OntologyTemporalMetadata,
    id::{OntologyTypeRecordId, OntologyTypeUuid},
    provenance::{OntologyOwnership, OntologyProvenance},
};

use crate::{
    snapshot::{SnapshotRestoreError, ontology::OntologyTypeMetadataRowBatch},
    store::postgres::query::rows::{
        OntologyExternalMetadataRow, OntologyIdRow, OntologyOwnedMetadataRow,
        OntologyTemporalMetadataRow,
    },
};

#[derive(Debug, Clone)]
pub struct OntologyTypeMetadataSender {
    id: Sender<OntologyIdRow>,
    temporal_metadata: Sender<OntologyTemporalMetadataRow>,
    owned_metadata: Sender<OntologyOwnedMetadataRow>,
    external_metadata: Sender<OntologyExternalMetadataRow>,
}

pub struct OntologyTypeMetadata {
    pub ontology_id: OntologyTypeUuid,
    pub record_id: OntologyTypeRecordId,
    pub ownership: OntologyOwnership,
    pub temporal_versioning: OntologyTemporalMetadata,
    pub provenance: OntologyProvenance,
}

impl Sink<OntologyTypeMetadata> for OntologyTypeMetadataSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll id sender")?;
        ready!(self.temporal_metadata.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll temporal metadata sender")?;
        ready!(self.owned_metadata.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll owned metadata sender")?;
        ready!(self.external_metadata.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll external metadata sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        metadata: OntologyTypeMetadata,
    ) -> Result<(), Self::Error> {
        match metadata.ownership {
            OntologyOwnership::Local { web_id } => {
                self.owned_metadata
                    .start_send(OntologyOwnedMetadataRow {
                        ontology_id: metadata.ontology_id,
                        web_id,
                    })
                    .change_context(SnapshotRestoreError::Read)
                    .attach_printable("could not send owned metadata")?;
            }
            OntologyOwnership::Remote { fetched_at } => {
                self.external_metadata
                    .start_send(OntologyExternalMetadataRow {
                        ontology_id: metadata.ontology_id,
                        fetched_at,
                    })
                    .change_context(SnapshotRestoreError::Read)
                    .attach_printable("could not send external metadata")?;
            }
        }

        self.id
            .start_send(OntologyIdRow {
                ontology_id: metadata.ontology_id,
                base_url: metadata.record_id.base_url,
                version: metadata.record_id.version,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send id")?;

        self.temporal_metadata
            .start_send(OntologyTemporalMetadataRow {
                ontology_id: metadata.ontology_id,
                transaction_time: metadata.temporal_versioning.transaction_time,
                provenance: metadata.provenance.edition,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send temporal metadata")?;

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush id sender")?;
        ready!(self.temporal_metadata.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush temporal metadata sender")?;
        ready!(self.owned_metadata.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush owned metadata sender")?;
        ready!(self.external_metadata.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush external metadata sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close id sender")?;
        ready!(self.temporal_metadata.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close temporal metadata sender")?;
        ready!(self.owned_metadata.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close owned metadata sender")?;
        ready!(self.external_metadata.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close external metadata sender")?;

        Poll::Ready(Ok(()))
    }
}

pub struct OntologyTypeMetadataReceiver {
    stream: SelectAll<BoxStream<'static, OntologyTypeMetadataRowBatch>>,
}

impl Stream for OntologyTypeMetadataReceiver {
    type Item = OntologyTypeMetadataRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

pub fn ontology_metadata_channel(
    chunk_size: usize,
) -> (OntologyTypeMetadataSender, OntologyTypeMetadataReceiver) {
    let (id_tx, id_rx) = mpsc::channel(chunk_size);
    let (temporal_metadata_tx, temporal_metadata_rx) = mpsc::channel(chunk_size);
    let (owned_metadata_tx, owned_metadata_rx) = mpsc::channel(chunk_size);
    let (external_metadata_tx, external_metadata_rx) = mpsc::channel(chunk_size);

    (
        OntologyTypeMetadataSender {
            id: id_tx,
            temporal_metadata: temporal_metadata_tx,
            owned_metadata: owned_metadata_tx,
            external_metadata: external_metadata_tx,
        },
        OntologyTypeMetadataReceiver {
            stream: select_all([
                id_rx
                    .ready_chunks(chunk_size)
                    .map(OntologyTypeMetadataRowBatch::Ids)
                    .boxed(),
                temporal_metadata_rx
                    .ready_chunks(chunk_size)
                    .map(OntologyTypeMetadataRowBatch::TemporalMetadata)
                    .boxed(),
                owned_metadata_rx
                    .ready_chunks(chunk_size)
                    .map(OntologyTypeMetadataRowBatch::OwnedMetadata)
                    .boxed(),
                external_metadata_rx
                    .ready_chunks(chunk_size)
                    .map(OntologyTypeMetadataRowBatch::ExternalMetadata)
                    .boxed(),
            ]),
        },
    )
}
