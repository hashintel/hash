use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};
use std::collections::{HashMap, HashSet};

use authorization::schema::EntityTypeRelationAndSubject;
use error_stack::{Report, ResultExt};
use futures::{
    Sink, SinkExt, Stream, StreamExt,
    channel::mpsc::{self, Receiver, Sender},
    stream::{BoxStream, SelectAll, select_all},
};
use type_system::{
    Valid,
    schema::{ClosedEntityType, EntityTypeUuid, InverseEntityTypeMetadata},
};

use crate::{
    snapshot::{
        SnapshotRestoreError,
        ontology::{
            EntityTypeSnapshotRecord, OntologyTypeMetadataSender,
            entity_type::batch::EntityTypeRowBatch, metadata::OntologyTypeMetadata,
        },
    },
    store::postgres::query::rows::{EntityTypeEmbeddingRow, EntityTypeRow},
};

/// A sink to insert [`EntityTypeSnapshotRecord`]s.
///
/// An `EntityTypeSender` with the corresponding [`EntityTypeReceiver`] are created using the
/// [`entity_type_channel`] function.
#[derive(Debug, Clone)]
pub struct EntityTypeSender {
    metadata: OntologyTypeMetadataSender,
    schema: Sender<EntityTypeRow>,
    relations: Sender<(EntityTypeUuid, Vec<EntityTypeRelationAndSubject>)>,
}

// This is a direct wrapper around several `Sink<mpsc::Sender>` and `OntologyTypeMetadataSender`
// with error-handling added to make it easier to use. It's taking an `OntologyTypeSnapshotRecord`
// and sending the individual rows to the corresponding sinks.
impl Sink<EntityTypeSnapshotRecord> for EntityTypeSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_ready_unpin(cx))
            .attach_printable("could not poll ontology type sender")?;
        ready!(self.schema.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll schema sender")?;
        ready!(self.relations.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        entity_type: EntityTypeSnapshotRecord,
    ) -> Result<(), Self::Error> {
        let ontology_id = EntityTypeUuid::from_url(&entity_type.schema.id);

        self.metadata
            .start_send_unpin(OntologyTypeMetadata {
                ontology_id: ontology_id.into(),
                record_id: entity_type.metadata.record_id,
                classification: entity_type.metadata.classification,
                temporal_versioning: entity_type.metadata.temporal_versioning,
                provenance: entity_type.metadata.provenance,
            })
            .attach_printable("could not send metadata")?;

        self.schema
            .start_send_unpin(EntityTypeRow {
                ontology_id,
                // An empty schema is inserted initially. This will be replaced later by the closed
                // schema.
                // TODO: Validate ontology types in snapshots
                //   see https://linear.app/hash/issue/H-3038
                closed_schema: Valid::new_unchecked(ClosedEntityType {
                    id: entity_type.schema.id.clone(),
                    title: "<UNSET>".to_owned(),
                    title_plural: None,
                    description: None,
                    properties: entity_type.schema.properties.clone(),
                    required: HashSet::new(),
                    links: HashMap::new(),
                    inverse: InverseEntityTypeMetadata::default(),
                    label_property: None,
                    icon: None,
                }),
                // TODO: Validate ontology types in snapshots
                //   see https://linear.app/hash/issue/H-3038
                schema: Valid::new_unchecked(entity_type.schema),
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send schema")?;

        self.relations
            .start_send_unpin((ontology_id, entity_type.relations))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send entity relations")?;

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_flush_unpin(cx))
            .attach_printable("could not flush ontology type sender")?;
        ready!(self.schema.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush schema sender")?;
        ready!(self.relations.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_close_unpin(cx))
            .attach_printable("could not close ontology type sender")?;
        ready!(self.schema.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close schema sender")?;
        ready!(self.relations.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close relations sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to receive [`EntityTypeRowBatch`]es.
///
/// An `EntityTypeReceiver` with the corresponding [`EntityTypeSender`] are created using the
/// [`entity_type_channel`] function.
pub struct EntityTypeReceiver {
    stream: SelectAll<BoxStream<'static, EntityTypeRowBatch>>,
}

// This is a direct wrapper around the underlying stream, batches the row in chunks, and unifies
// the `Item` into a single enumeration.
impl Stream for EntityTypeReceiver {
    type Item = EntityTypeRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Create a new [`EntityTypeSender`] and [`EntityTypeReceiver`] pair.
///
/// The `chunk_size` parameter is used to batch the rows into chunks of the given size.
pub(crate) fn entity_type_channel(
    chunk_size: usize,
    metadata_sender: OntologyTypeMetadataSender,
    embedding_rx: Receiver<EntityTypeEmbeddingRow<'static>>,
) -> (EntityTypeSender, EntityTypeReceiver) {
    let (schema_tx, schema_rx) = mpsc::channel(chunk_size);
    let (relations_tx, relations_rx) = mpsc::channel(chunk_size);

    (
        EntityTypeSender {
            metadata: metadata_sender,
            schema: schema_tx,
            relations: relations_tx,
        },
        EntityTypeReceiver {
            stream: select_all([
                schema_rx
                    .ready_chunks(chunk_size)
                    .map(EntityTypeRowBatch::Schema)
                    .boxed(),
                relations_rx
                    .ready_chunks(chunk_size)
                    .map(|relations| EntityTypeRowBatch::Relations(relations.into_iter().collect()))
                    .boxed(),
                embedding_rx
                    .ready_chunks(chunk_size)
                    .map(EntityTypeRowBatch::Embeddings)
                    .boxed(),
            ]),
        },
    )
}
