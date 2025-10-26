use alloc::sync::Arc;
use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use futures::{
    Sink, SinkExt as _, Stream, StreamExt as _,
    channel::mpsc::{self, Receiver, Sender},
    stream::{BoxStream, SelectAll, select_all},
};
use type_system::{
    Valid, Validator as _,
    ontology::{
        entity_type::{
            ClosedEntityType, EntityTypeUuid,
            schema::{EntityConstraints, EntityTypeValidator, InverseEntityTypeMetadata},
        },
        id::{OntologyTypeVersion, VersionedUrl},
    },
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
    validator: Arc<EntityTypeValidator>,
    metadata: OntologyTypeMetadataSender,
    schema: Sender<EntityTypeRow>,
}

// This is a direct wrapper around several `Sink<mpsc::Sender>` and `OntologyTypeMetadataSender`
// with error-handling added to make it easier to use. It's taking an `OntologyTypeSnapshotRecord`
// and sending the individual rows to the corresponding sinks.
impl Sink<EntityTypeSnapshotRecord> for EntityTypeSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_ready_unpin(cx)).attach("could not poll ontology type sender")?;
        ready!(self.schema.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll schema sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        entity_type: EntityTypeSnapshotRecord,
    ) -> Result<(), Self::Error> {
        let schema = (*self.validator)
            .validate(entity_type.schema)
            .change_context(SnapshotRestoreError::Validation)?;
        let ontology_id = EntityTypeUuid::from_url(&schema.id);

        self.metadata
            .start_send_unpin(OntologyTypeMetadata {
                ontology_id: ontology_id.into(),
                record_id: entity_type.metadata.record_id,
                ownership: entity_type.metadata.ownership,
                temporal_versioning: entity_type.metadata.temporal_versioning,
                provenance: entity_type.metadata.provenance,
            })
            .attach("could not send metadata")?;

        self.schema
            .start_send_unpin(EntityTypeRow {
                ontology_id,
                // An empty schema is inserted initially. This will be replaced later by the closed
                // schema.
                closed_schema: Valid::new_unchecked(ClosedEntityType {
                    id: VersionedUrl {
                        base_url: schema.id.base_url.clone(),
                        version: OntologyTypeVersion {
                            major: 0,
                            pre_release: None,
                        },
                    },
                    title: String::new(),
                    title_plural: None,
                    description: String::new(),
                    inverse: InverseEntityTypeMetadata {
                        title: None,
                        title_plural: None,
                    },
                    constraints: EntityConstraints {
                        properties: HashMap::new(),
                        required: HashSet::new(),
                        links: HashMap::new(),
                    },
                    all_of: Vec::new(),
                }),
                schema,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach("could not send schema")?;

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_flush_unpin(cx))
            .attach("could not flush ontology type sender")?;
        ready!(self.schema.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush schema sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_close_unpin(cx))
            .attach("could not close ontology type sender")?;
        ready!(self.schema.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close schema sender")?;

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

    (
        EntityTypeSender {
            validator: Arc::new(EntityTypeValidator),
            metadata: metadata_sender,
            schema: schema_tx,
        },
        EntityTypeReceiver {
            stream: select_all([
                schema_rx
                    .ready_chunks(chunk_size)
                    .map(EntityTypeRowBatch::Schema)
                    .boxed(),
                embedding_rx
                    .ready_chunks(chunk_size)
                    .map(EntityTypeRowBatch::Embeddings)
                    .boxed(),
            ]),
        },
    )
}
