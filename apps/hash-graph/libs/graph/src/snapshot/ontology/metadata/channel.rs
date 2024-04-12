use std::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use error_stack::{Report, ResultExt};
use futures::{
    channel::mpsc::{self, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};
use graph_types::ontology::{
    OntologyProvenanceMetadata, OntologyTemporalMetadata, OntologyTypeClassificationMetadata,
    OntologyTypeRecordId,
};
use uuid::Uuid;

use crate::snapshot::{
    ontology::{
        table::OntologyTemporalMetadataRow, OntologyExternalMetadataRow, OntologyIdRow,
        OntologyOwnedMetadataRow, OntologyTypeMetadataRowBatch,
    },
    SnapshotRestoreError,
};

#[derive(Debug, Clone)]
pub struct OntologyTypeMetadataSender {
    id: Sender<OntologyIdRow>,
    temporal_metadata: Sender<OntologyTemporalMetadataRow>,
    owned_metadata: Sender<OntologyOwnedMetadataRow>,
    external_metadata: Sender<OntologyExternalMetadataRow>,
}

impl
    Sink<(
        Uuid,
        OntologyTypeRecordId,
        OntologyTypeClassificationMetadata,
        OntologyTemporalMetadata,
        OntologyProvenanceMetadata,
    )> for OntologyTypeMetadataSender
{
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
        (ontology_id, record_id, classification, temporal_versioning, provenance): (
            Uuid,
            OntologyTypeRecordId,
            OntologyTypeClassificationMetadata,
            OntologyTemporalMetadata,
            OntologyProvenanceMetadata,
        ),
    ) -> Result<(), Self::Error> {
        match classification {
            OntologyTypeClassificationMetadata::Owned { owned_by_id } => {
                self.owned_metadata
                    .start_send(OntologyOwnedMetadataRow {
                        ontology_id,
                        web_id: owned_by_id,
                    })
                    .change_context(SnapshotRestoreError::Read)
                    .attach_printable("could not send owned metadata")?;
            }
            OntologyTypeClassificationMetadata::External { fetched_at } => {
                self.external_metadata
                    .start_send(OntologyExternalMetadataRow {
                        ontology_id,
                        fetched_at,
                    })
                    .change_context(SnapshotRestoreError::Read)
                    .attach_printable("could not send external metadata")?;
            }
        };

        self.id
            .start_send(OntologyIdRow {
                ontology_id,
                base_url: record_id.base_url,
                version: record_id.version,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send id")?;

        self.temporal_metadata
            .start_send(OntologyTemporalMetadataRow {
                ontology_id,
                transaction_time: temporal_versioning.transaction_time,
                provenance: provenance.edition,
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
