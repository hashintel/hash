use core::{
    pin::Pin,
    result::Result as StdResult,
    task::{Context, Poll, ready},
};

use error_stack::{Report, ResultExt as _};
use futures::{
    Sink, SinkExt as _, Stream, StreamExt as _,
    channel::mpsc::{self, Sender, UnboundedReceiver, UnboundedSender},
    stream::{BoxStream, SelectAll, select_all},
};
use type_system::ontology::{
    data_type::DataTypeUuid, entity_type::EntityTypeUuid, property_type::PropertyTypeUuid,
};

use crate::{
    snapshot::{
        SnapshotEntry, SnapshotMetadata, SnapshotRestoreError,
        action::{self, ActionSender},
        entity::{self, EntitySender},
        ontology::{self, DataTypeSender, EntityTypeSender, PropertyTypeSender},
        policy::{self, PolicyActionSender, PolicyEditionSender},
        principal::{self, PrincipalSender},
        restore::batch::SnapshotRecordBatch,
    },
    store::postgres::query::rows::{
        DataTypeEmbeddingRow, EntityEmbeddingRow, EntityTypeEmbeddingRow, PropertyTypeEmbeddingRow,
    },
};

#[derive(Debug, Clone)]
pub struct SnapshotRecordSender {
    metadata: UnboundedSender<SnapshotMetadata>,
    principal: PrincipalSender,
    action: ActionSender,
    policy_edition: PolicyEditionSender,
    policy_action: PolicyActionSender,
    data_type: DataTypeSender,
    data_type_embedding: Sender<DataTypeEmbeddingRow<'static>>,
    property_type: PropertyTypeSender,
    property_type_embedding: Sender<PropertyTypeEmbeddingRow<'static>>,
    entity_type: EntityTypeSender,
    entity_type_embedding: Sender<EntityTypeEmbeddingRow<'static>>,
    entity: EntitySender,
    entity_embedding: Sender<EntityEmbeddingRow>,
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
        ready!(self.principal.poll_ready_unpin(cx))
            .attach_printable("could not poll principal sender")?;
        ready!(self.action.poll_ready_unpin(cx))
            .attach_printable("could not poll action sender")?;
        ready!(self.policy_edition.poll_ready_unpin(cx))
            .attach_printable("could not poll policy sender")?;
        ready!(self.policy_action.poll_ready_unpin(cx))
            .attach_printable("could not poll policy action sender")?;
        ready!(self.data_type.poll_ready_unpin(cx))
            .attach_printable("could not poll data type sender")?;
        ready!(self.data_type_embedding.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll data type embedding sender")?;
        ready!(self.property_type.poll_ready_unpin(cx))
            .attach_printable("could not poll property type sender")?;
        ready!(self.property_type_embedding.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll property type embedding sender")?;
        ready!(self.entity_type.poll_ready_unpin(cx))
            .attach_printable("could not poll entity type sender")?;
        ready!(self.entity_type_embedding.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll entity type embedding sender")?;
        ready!(self.entity.poll_ready_unpin(cx))
            .attach_printable("could not poll entity sender")?;
        ready!(self.entity_embedding.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll entity embedding sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(mut self: Pin<&mut Self>, entity: SnapshotEntry) -> StdResult<(), Self::Error> {
        match entity {
            SnapshotEntry::Snapshot(snapshot) => self
                .metadata
                .start_send_unpin(snapshot)
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send snapshot metadata"),
            SnapshotEntry::Principal(principal) => self
                .principal
                .start_send_unpin(principal)
                .attach_printable("could not send principal"),
            SnapshotEntry::Action(action) => self
                .action
                .start_send_unpin(action)
                .attach_printable("could not send action"),
            SnapshotEntry::Policy(policy) => self
                .policy_edition
                .start_send_unpin(policy)
                .attach_printable("could not send policy"),
            SnapshotEntry::PolicyActions(action) => self
                .policy_action
                .start_send_unpin(action)
                .attach_printable("could not send policy action"),
            SnapshotEntry::DataType(data_type) => self
                .data_type
                .start_send_unpin(*data_type)
                .attach_printable("could not send data type"),
            SnapshotEntry::DataTypeEmbedding(embedding) => self
                .data_type_embedding
                .start_send_unpin(DataTypeEmbeddingRow {
                    ontology_id: DataTypeUuid::from_url(&embedding.data_type_id),
                    embedding: embedding.embedding,
                    updated_at_transaction_time: embedding.updated_at_transaction_time,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send data type embedding"),
            SnapshotEntry::PropertyType(property_type) => self
                .property_type
                .start_send_unpin(*property_type)
                .attach_printable("could not send property type"),
            SnapshotEntry::PropertyTypeEmbedding(embedding) => self
                .property_type_embedding
                .start_send_unpin(PropertyTypeEmbeddingRow {
                    ontology_id: PropertyTypeUuid::from_url(&embedding.property_type_id),
                    embedding: embedding.embedding,
                    updated_at_transaction_time: embedding.updated_at_transaction_time,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send property type embedding"),
            SnapshotEntry::EntityType(entity_type) => self
                .entity_type
                .start_send_unpin(*entity_type)
                .attach_printable("could not send entity type"),
            SnapshotEntry::EntityTypeEmbedding(embedding) => self
                .entity_type_embedding
                .start_send_unpin(EntityTypeEmbeddingRow {
                    ontology_id: EntityTypeUuid::from_url(&embedding.entity_type_id),
                    embedding: embedding.embedding,
                    updated_at_transaction_time: embedding.updated_at_transaction_time,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send entity type embedding"),
            SnapshotEntry::Entity(entity) => self
                .entity
                .start_send_unpin(*entity)
                .attach_printable("could not send entity"),
            SnapshotEntry::EntityEmbedding(embedding) => self
                .entity_embedding
                .start_send_unpin(EntityEmbeddingRow {
                    web_id: embedding.entity_id.web_id,
                    entity_uuid: embedding.entity_id.entity_uuid,
                    draft_id: embedding.entity_id.draft_id,
                    property: embedding.property.as_ref().map(ToString::to_string),
                    embedding: embedding.embedding,
                    updated_at_transaction_time: embedding.updated_at_transaction_time,
                    updated_at_decision_time: embedding.updated_at_decision_time,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send entity embedding"),
        }
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.metadata.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush metadata sender")?;
        ready!(self.principal.poll_flush_unpin(cx))
            .attach_printable("could not flush principal sender")?;
        ready!(self.action.poll_flush_unpin(cx))
            .attach_printable("could not flush action sender")?;
        ready!(self.policy_edition.poll_flush_unpin(cx))
            .attach_printable("could not flush policy sender")?;
        ready!(self.policy_action.poll_flush_unpin(cx))
            .attach_printable("could not flush policy action sender")?;
        ready!(self.data_type.poll_flush_unpin(cx))
            .attach_printable("could not flush data type sender")?;
        ready!(self.data_type_embedding.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush data type embedding sender")?;
        ready!(self.property_type.poll_flush_unpin(cx))
            .attach_printable("could not flush property type sender")?;
        ready!(self.property_type_embedding.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush property type embedding sender")?;
        ready!(self.entity_type.poll_flush_unpin(cx))
            .attach_printable("could not flush entity type sender")?;
        ready!(self.entity_type_embedding.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush entity type embedding sender")?;
        ready!(self.entity.poll_flush_unpin(cx))
            .attach_printable("could not flush entity sender")?;
        ready!(self.entity_embedding.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush entity embedding sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.metadata.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close metadata sender")?;
        ready!(self.principal.poll_close_unpin(cx))
            .attach_printable("could not close principal sender")?;
        ready!(self.action.poll_close_unpin(cx))
            .attach_printable("could not close action sender")?;
        ready!(self.policy_edition.poll_close_unpin(cx))
            .attach_printable("could not close policy sender")?;
        ready!(self.policy_action.poll_close_unpin(cx))
            .attach_printable("could not close policy action sender")?;
        ready!(self.data_type.poll_close_unpin(cx))
            .attach_printable("could not close data type sender")?;
        ready!(self.data_type_embedding.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close data type embedding sender")?;
        ready!(self.property_type.poll_close_unpin(cx))
            .attach_printable("could not close property type sender")?;
        ready!(self.property_type_embedding.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close property type embedding sender")?;
        ready!(self.entity_type.poll_close_unpin(cx))
            .attach_printable("could not close entity type sender")?;
        ready!(self.entity_type_embedding.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close entity type embedding sender")?;
        ready!(self.entity.poll_close_unpin(cx))
            .attach_printable("could not close entity sender")?;
        ready!(self.entity_embedding.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close entity embedding sender")?;

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

pub(crate) fn channel(
    chunk_size: usize,
) -> (
    SnapshotRecordSender,
    SnapshotRecordReceiver,
    UnboundedReceiver<SnapshotMetadata>,
) {
    let (metadata_tx, metadata_rx) = mpsc::unbounded();
    let (principal_tx, principal_rx) = principal::channel(chunk_size);
    let (action_tx, action_rx) = action::channel(chunk_size);
    let (policy_edition_tx, policy_action_tx, policy_rx) = policy::channel(chunk_size);
    let (ontology_metadata_tx, ontology_metadata_rx) =
        ontology::ontology_metadata_channel(chunk_size);
    let (data_type_embedding_tx, data_type_embedding_rx) = mpsc::channel(chunk_size);
    let (data_type_tx, data_type_rx) = ontology::data_type_channel(
        chunk_size,
        ontology_metadata_tx.clone(),
        data_type_embedding_rx,
    );
    let (property_type_embedding_tx, property_type_embedding_rx) = mpsc::channel(chunk_size);
    let (property_type_tx, property_type_rx) = ontology::property_type_channel(
        chunk_size,
        ontology_metadata_tx.clone(),
        property_type_embedding_rx,
    );
    let (entity_type_embedding_tx, entity_type_embedding_rx) = mpsc::channel(chunk_size);
    let (entity_type_tx, entity_type_rx) =
        ontology::entity_type_channel(chunk_size, ontology_metadata_tx, entity_type_embedding_rx);
    let (entity_embedding_tx, entity_embedding_rx) = mpsc::channel(chunk_size);
    let (entity_tx, entity_rx) = entity::channel(chunk_size, entity_embedding_rx);

    (
        SnapshotRecordSender {
            principal: principal_tx,
            action: action_tx,
            policy_edition: policy_edition_tx,
            policy_action: policy_action_tx,
            metadata: metadata_tx,
            data_type: data_type_tx,
            data_type_embedding: data_type_embedding_tx,
            property_type: property_type_tx,
            property_type_embedding: property_type_embedding_tx,
            entity_type: entity_type_tx,
            entity_type_embedding: entity_type_embedding_tx,
            entity: entity_tx,
            entity_embedding: entity_embedding_tx,
        },
        SnapshotRecordReceiver {
            stream: select_all(vec![
                principal_rx.map(SnapshotRecordBatch::Principals).boxed(),
                action_rx.map(SnapshotRecordBatch::Actions).boxed(),
                policy_rx.map(SnapshotRecordBatch::Policies).boxed(),
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
