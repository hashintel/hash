use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use authorization::schema::DataTypeRelationAndSubject;
use error_stack::{Report, ResultExt};
use futures::{
    Sink, SinkExt, Stream, StreamExt,
    channel::mpsc::{self, Receiver, Sender},
    stream::{BoxStream, SelectAll, select_all},
};
use type_system::{
    Valid,
    schema::{ClosedDataType, DataTypeUuid, ValueLabel},
    url::{OntologyTypeVersion, VersionedUrl},
};

use crate::{
    snapshot::{
        SnapshotRestoreError,
        ontology::{
            DataTypeSnapshotRecord, OntologyTypeMetadataSender, data_type::batch::DataTypeRowBatch,
            metadata::OntologyTypeMetadata,
        },
    },
    store::postgres::query::rows::{DataTypeConversionsRow, DataTypeEmbeddingRow, DataTypeRow},
};

/// A sink to insert [`DataTypeSnapshotRecord`]s.
///
/// An `DataTypeSender` with the corresponding [`DataTypeReceiver`] are created using the
/// [`data_type_channel`] function.
#[derive(Debug, Clone)]
pub struct DataTypeSender {
    metadata: OntologyTypeMetadataSender,
    schema: Sender<DataTypeRow>,
    conversions: Sender<Vec<DataTypeConversionsRow>>,
    relations: Sender<(DataTypeUuid, Vec<DataTypeRelationAndSubject>)>,
}

// This is a direct wrapper around `Sink<mpsc::Sender<DataTypeRow>>` with and
// `OntologyTypeMetadataSender` with error-handling added to make it easier to use.
impl Sink<DataTypeSnapshotRecord> for DataTypeSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_ready_unpin(cx))
            .attach_printable("could not poll ontology type sender")?;
        ready!(self.schema.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll schema sender")?;
        ready!(self.conversions.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll conversions sender")?;
        ready!(self.relations.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        data_type: DataTypeSnapshotRecord,
    ) -> Result<(), Self::Error> {
        let ontology_id = DataTypeUuid::from_url(&data_type.schema.id);

        self.metadata
            .start_send_unpin(OntologyTypeMetadata {
                ontology_id: ontology_id.into(),
                record_id: data_type.metadata.record_id,
                classification: data_type.metadata.classification,
                temporal_versioning: data_type.metadata.temporal_versioning,
                provenance: data_type.metadata.provenance,
            })
            .attach_printable("could not send metadata")?;
        self.schema
            .start_send_unpin(DataTypeRow {
                ontology_id,
                // TODO: Validate ontology types in snapshots
                //   see https://linear.app/hash/issue/H-3038
                schema: Valid::new_unchecked(data_type.schema.clone()),
                // An empty schema is inserted initially. This will be replaced later by the closed
                // schema.
                closed_schema: Valid::new_unchecked(ClosedDataType {
                    id: VersionedUrl {
                        base_url: data_type.schema.id.base_url.clone(),
                        version: OntologyTypeVersion::new(0),
                    },
                    title: String::new(),
                    title_plural: None,
                    description: String::new(),
                    label: ValueLabel::default(),
                    all_of: Vec::new(),
                    r#abstract: true,
                }),
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send schema")?;
        self.conversions
            .start_send_unpin(
                data_type
                    .metadata
                    .conversions
                    .into_iter()
                    .map(|(target, conversion)| DataTypeConversionsRow {
                        source_data_type_ontology_id: ontology_id,
                        target_data_type_base_url: target,
                        from: conversion.from,
                        into: conversion.to,
                    })
                    .collect(),
            )
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send data conversions")?;

        self.relations
            .start_send_unpin((ontology_id, data_type.relations))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send data relations")?;

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_flush_unpin(cx))
            .attach_printable("could not flush ontology type sender")?;
        ready!(self.schema.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush schema sender")?;
        ready!(self.conversions.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush conversions sender")?;
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
        ready!(self.conversions.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close conversions sender")?;
        ready!(self.relations.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close relations sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to receive [`DataTypeRowBatch`]es.
///
/// An `DataTypeReceiver` with the corresponding [`DataTypeSender`] are created using the
/// [`data_type_channel`] function.
pub struct DataTypeReceiver {
    stream: SelectAll<BoxStream<'static, DataTypeRowBatch>>,
}

// This is a direct wrapper around the underlying stream, batches the row in chunks, and unifies
// the `Item` into a single enumeration.
impl Stream for DataTypeReceiver {
    type Item = DataTypeRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Create a new [`DataTypeSender`] and [`DataTypeReceiver`] pair.
///
/// The `chunk_size` parameter is used to batch the rows into chunks of the given size.
pub(crate) fn data_type_channel(
    chunk_size: usize,
    metadata_sender: OntologyTypeMetadataSender,
    embedding_rx: Receiver<DataTypeEmbeddingRow<'static>>,
) -> (DataTypeSender, DataTypeReceiver) {
    let (schema_tx, schema_rx) = mpsc::channel(chunk_size);
    let (conversions_tx, conversions_rx) = mpsc::channel(chunk_size);
    let (relations_tx, relations_rx) = mpsc::channel(chunk_size);

    (
        DataTypeSender {
            metadata: metadata_sender,
            schema: schema_tx,
            conversions: conversions_tx,
            relations: relations_tx,
        },
        DataTypeReceiver {
            stream: select_all([
                schema_rx
                    .ready_chunks(chunk_size)
                    .map(DataTypeRowBatch::Schema)
                    .boxed(),
                conversions_rx
                    .ready_chunks(chunk_size)
                    .map(|rows| DataTypeRowBatch::Conversions(rows.into_iter().flatten().collect()))
                    .boxed(),
                relations_rx
                    .ready_chunks(chunk_size)
                    .map(|relations| DataTypeRowBatch::Relations(relations.into_iter().collect()))
                    .boxed(),
                embedding_rx
                    .ready_chunks(chunk_size)
                    .map(DataTypeRowBatch::Embeddings)
                    .boxed(),
            ]),
        },
    )
}
