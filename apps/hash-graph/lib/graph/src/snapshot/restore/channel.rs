use std::{
    pin::Pin,
    result::Result as StdResult,
    task::{ready, Context, Poll},
};

use error_stack::{IntoReport, Report, ResultExt};
use futures::{
    channel::mpsc::{self, UnboundedReceiver, UnboundedSender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};

use crate::snapshot::{
    account,
    entity::{self, EntitySender},
    ontology::{self, DataTypeSender, EntityTypeSender, PropertyTypeSender},
    restore::batch::SnapshotRecordBatch,
    SnapshotEntry, SnapshotMetadata, SnapshotRestoreError,
};

#[derive(Debug, Clone)]
pub struct SnapshotRecordSender {
    metadata: UnboundedSender<SnapshotMetadata>,
    data_type: DataTypeSender,
    property_type: PropertyTypeSender,
    entity_type: EntityTypeSender,
    entity: EntitySender,
}

impl Sink<SnapshotEntry> for SnapshotRecordSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.metadata.poll_ready_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll metadata sender")?;
        ready!(self.data_type.poll_ready_unpin(cx))
            .attach_printable("could not poll data type sender")?;
        ready!(self.property_type.poll_ready_unpin(cx))
            .attach_printable("could not poll property type sender")?;
        ready!(self.entity_type.poll_ready_unpin(cx))
            .attach_printable("could not poll entity type sender")?;
        ready!(self.entity.poll_ready_unpin(cx))
            .attach_printable("could not poll entity sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(mut self: Pin<&mut Self>, entity: SnapshotEntry) -> StdResult<(), Self::Error> {
        match entity {
            SnapshotEntry::Snapshot(snapshot) => self
                .metadata
                .start_send_unpin(snapshot)
                .into_report()
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send snapshot metadata"),
            SnapshotEntry::DataType(data_type) => self
                .data_type
                .start_send_unpin(data_type)
                .attach_printable("could not send data type"),
            SnapshotEntry::PropertyType(property_type) => self
                .property_type
                .start_send_unpin(property_type)
                .attach_printable("could not send property type"),
            SnapshotEntry::EntityType(entity_type) => self
                .entity_type
                .start_send_unpin(entity_type)
                .attach_printable("could not send entity type"),
            SnapshotEntry::Entity(entity) => self
                .entity
                .start_send_unpin(entity)
                .attach_printable("could not send entity"),
        }
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.metadata.poll_flush_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush metadata sender")?;
        ready!(self.data_type.poll_flush_unpin(cx))
            .attach_printable("could not flush data type sender")?;
        ready!(self.property_type.poll_flush_unpin(cx))
            .attach_printable("could not flush property type sender")?;
        ready!(self.entity_type.poll_flush_unpin(cx))
            .attach_printable("could not flush entity type sender")?;
        ready!(self.entity.poll_flush_unpin(cx))
            .attach_printable("could not flush entity sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.metadata.poll_close_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close metadata sender")?;
        ready!(self.data_type.poll_close_unpin(cx))
            .attach_printable("could not close data type sender")?;
        ready!(self.property_type.poll_close_unpin(cx))
            .attach_printable("could not close property type sender")?;
        ready!(self.entity_type.poll_close_unpin(cx))
            .attach_printable("could not close entity type sender")?;
        ready!(self.entity.poll_close_unpin(cx))
            .attach_printable("could not close entity sender")?;

        Poll::Ready(Ok(()))
    }
}

pub struct SnapshotRecordReceiver {
    stream: SelectAll<BoxStream<'static, SnapshotRecordBatch>>,
}

impl Stream for SnapshotRecordReceiver {
    type Item = SnapshotRecordBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

pub fn channel(
    chunk_size: usize,
) -> (
    SnapshotRecordSender,
    SnapshotRecordReceiver,
    UnboundedReceiver<SnapshotMetadata>,
) {
    let (metadata_tx, metadata_rx) = mpsc::unbounded();
    let (account_tx, account_rx) = account::channel(chunk_size);
    let (ontology_metadata_tx, ontology_metadata_rx) =
        ontology::ontology_metadata_channel(chunk_size, account_tx.clone());
    let (data_type_tx, data_type_rx) =
        ontology::data_type_channel(chunk_size, ontology_metadata_tx.clone());
    let (property_type_tx, property_type_rx) =
        ontology::property_type_channel(chunk_size, ontology_metadata_tx.clone());
    let (entity_type_tx, entity_type_rx) =
        ontology::entity_type_channel(chunk_size, ontology_metadata_tx);
    let (entity_tx, entity_rx) = entity::channel(chunk_size, account_tx);

    (
        SnapshotRecordSender {
            metadata: metadata_tx,
            data_type: data_type_tx,
            property_type: property_type_tx,
            entity_type: entity_type_tx,
            entity: entity_tx,
        },
        SnapshotRecordReceiver {
            stream: select_all(vec![
                account_rx.map(SnapshotRecordBatch::Accounts).boxed(),
                ontology_metadata_rx
                    .map(SnapshotRecordBatch::OntologyTypes)
                    .boxed(),
                data_type_rx.map(SnapshotRecordBatch::DataTypes).boxed(),
                property_type_rx
                    .map(SnapshotRecordBatch::PropertyTypes)
                    .boxed(),
                entity_type_rx.map(SnapshotRecordBatch::EntityTypes).boxed(),
                entity_rx.map(SnapshotRecordBatch::Entities).boxed(),
            ]),
        },
        metadata_rx,
    )
}
