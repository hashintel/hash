use std::{
    pin::Pin,
    result::Result as StdResult,
    task::{ready, Context, Poll},
};

use error_stack::{Report, ResultExt};
use futures::{
    channel::mpsc::{self, UnboundedReceiver, UnboundedSender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};

use crate::snapshot::{
    entity::{self, EntitySender},
    ontology::{self, DataTypeSender, EntityTypeSender, PropertyTypeSender},
    owner,
    owner::{Owner, OwnerSender},
    restore::batch::SnapshotRecordBatch,
    web,
    web::WebSender,
    SnapshotEntry, SnapshotMetadata, SnapshotRestoreError,
};

#[derive(Debug, Clone)]
pub struct SnapshotRecordSender {
    metadata: UnboundedSender<SnapshotMetadata>,
    owner: OwnerSender,
    webs: WebSender,
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
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll metadata sender")?;
        ready!(self.owner.poll_ready_unpin(cx)).attach_printable("could not poll owner sender")?;
        ready!(self.webs.poll_ready_unpin(cx))
            .attach_printable("could not poll web sender")
            .change_context(SnapshotRestoreError::Read)?;
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
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send snapshot metadata"),
            SnapshotEntry::Account(account) => self
                .owner
                .start_send_unpin(Owner::Account(account))
                .attach_printable("could not send account"),
            SnapshotEntry::Web(web) => self
                .webs
                .start_send_unpin(web)
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send web"),
            SnapshotEntry::AccountGroup(account_group) => self
                .owner
                .start_send_unpin(Owner::AccountGroup(account_group))
                .attach_printable("could not send account group"),
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
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush metadata sender")?;
        ready!(self.owner.poll_flush_unpin(cx)).attach_printable("could not flush owner sender")?;
        ready!(self.webs.poll_flush_unpin(cx))
            .attach_printable("could not flush web sender")
            .change_context(SnapshotRestoreError::Read)?;
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
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close metadata sender")?;
        ready!(self.owner.poll_close_unpin(cx)).attach_printable("could not close owner sender")?;
        ready!(self.webs.poll_close_unpin(cx))
            .attach_printable("could not close web sender")
            .change_context(SnapshotRestoreError::Read)?;
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
    let (owner_tx, owner_rx) = owner::channel(chunk_size);
    let (web_tx, web_rx) = web::channel(chunk_size);
    let (ontology_metadata_tx, ontology_metadata_rx) =
        ontology::ontology_metadata_channel(chunk_size);
    let (data_type_tx, data_type_rx) =
        ontology::data_type_channel(chunk_size, ontology_metadata_tx.clone());
    let (property_type_tx, property_type_rx) =
        ontology::property_type_channel(chunk_size, ontology_metadata_tx.clone());
    let (entity_type_tx, entity_type_rx) =
        ontology::entity_type_channel(chunk_size, ontology_metadata_tx);
    let (entity_tx, entity_rx) = entity::channel(chunk_size);

    (
        SnapshotRecordSender {
            owner: owner_tx,
            metadata: metadata_tx,
            webs: web_tx,
            data_type: data_type_tx,
            property_type: property_type_tx,
            entity_type: entity_type_tx,
            entity: entity_tx,
        },
        SnapshotRecordReceiver {
            stream: select_all(vec![
                owner_rx.map(SnapshotRecordBatch::Accounts).boxed(),
                web_rx.map(SnapshotRecordBatch::Webs).boxed(),
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
