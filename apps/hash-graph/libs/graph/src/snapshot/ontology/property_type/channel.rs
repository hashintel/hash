use core::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use authorization::schema::PropertyTypeRelationAndSubject;
use error_stack::{Report, ResultExt};
use futures::{
    channel::mpsc::{self, Receiver, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};
use graph_types::ontology::{DataTypeId, PropertyTypeId};
use type_system::Valid;

use crate::{
    snapshot::{
        ontology::{
            metadata::OntologyTypeMetadata, property_type::batch::PropertyTypeRowBatch,
            OntologyTypeMetadataSender, PropertyTypeSnapshotRecord,
        },
        SnapshotRestoreError,
    },
    store::postgres::query::rows::{
        PropertyTypeConstrainsPropertiesOnRow, PropertyTypeConstrainsValuesOnRow,
        PropertyTypeEmbeddingRow, PropertyTypeRow,
    },
};

/// A sink to insert [`PropertyTypeSnapshotRecord`]s.
///
/// An `PropertyTypeSender` with the corresponding [`PropertyTypeReceiver`] are created using the
/// [`property_type_channel`] function.
#[derive(Debug, Clone)]
pub struct PropertyTypeSender {
    metadata: OntologyTypeMetadataSender,
    schema: Sender<PropertyTypeRow>,
    constrains_values: Sender<Vec<PropertyTypeConstrainsValuesOnRow>>,
    constrains_properties: Sender<Vec<PropertyTypeConstrainsPropertiesOnRow>>,
    relations: Sender<(PropertyTypeId, Vec<PropertyTypeRelationAndSubject>)>,
}

// This is a direct wrapper around several `Sink<mpsc::Sender>` and `OntologyTypeMetadataSender`
// with error-handling added to make it easier to use. It's taking an `OntologyTypeSnapshotRecord`
// and sending the individual rows to the corresponding sinks.
impl Sink<PropertyTypeSnapshotRecord> for PropertyTypeSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_ready_unpin(cx))
            .attach_printable("could not poll ontology type sender")?;
        ready!(self.schema.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll schema sender")?;
        ready!(self.constrains_values.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll constrains values edge sender")?;
        ready!(self.constrains_properties.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll constrains properties edge sender")?;
        ready!(self.relations.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        property_type: PropertyTypeSnapshotRecord,
    ) -> Result<(), Self::Error> {
        let ontology_id = PropertyTypeId::from_record_id(&property_type.metadata.record_id);

        self.metadata
            .start_send_unpin(OntologyTypeMetadata {
                ontology_id: ontology_id.into(),
                record_id: property_type.metadata.record_id,
                classification: property_type.metadata.classification,
                temporal_versioning: property_type.metadata.temporal_versioning,
                provenance: property_type.metadata.provenance,
            })
            .attach_printable("could not send metadata")?;

        let values: Vec<_> = property_type
            .schema
            .data_type_references()
            .into_iter()
            .map(|data_type_ref| PropertyTypeConstrainsValuesOnRow {
                source_property_type_ontology_id: ontology_id,
                target_data_type_ontology_id: DataTypeId::from_url(&data_type_ref.url),
            })
            .collect();
        if !values.is_empty() {
            self.constrains_values
                .start_send_unpin(values)
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send constrains values edge")?;
        }

        let properties: Vec<_> = property_type
            .schema
            .property_type_references()
            .into_iter()
            .map(|property_type_ref| PropertyTypeConstrainsPropertiesOnRow {
                source_property_type_ontology_id: ontology_id,
                target_property_type_ontology_id: PropertyTypeId::from_url(&property_type_ref.url),
            })
            .collect();
        if !properties.is_empty() {
            self.constrains_properties
                .start_send_unpin(properties)
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send constrains properties edge")?;
        }

        self.schema
            .start_send_unpin(PropertyTypeRow {
                ontology_id,
                // TODO: Validate ontology types in snapshots
                //   see https://linear.app/hash/issue/H-3038
                schema: Valid::new_unchecked(property_type.schema),
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send schema")?;

        self.relations
            .start_send_unpin((ontology_id, property_type.relations))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send property relations")?;

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_flush_unpin(cx))
            .attach_printable("could not flush ontology type sender")?;
        ready!(self.schema.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush schema sender")?;
        ready!(self.constrains_values.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush constrains values edge sender")?;
        ready!(self.constrains_properties.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush constrains properties edge sender")?;
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
        ready!(self.constrains_values.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close constrains values edge sender")?;
        ready!(self.constrains_properties.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close constrains properties edge sender")?;
        ready!(self.relations.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close relations sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to receive [`PropertyTypeRowBatch`]es.
///
/// An `PropertyTypeReceiver` with the corresponding [`PropertyTypeSender`] are created using the
/// [`property_type_channel`] function.
pub struct PropertyTypeReceiver {
    stream: SelectAll<BoxStream<'static, PropertyTypeRowBatch>>,
}

// This is a direct wrapper around the underlying stream, batches the row in chunks, and unifies
// the `Item` into a single enumeration.
impl Stream for PropertyTypeReceiver {
    type Item = PropertyTypeRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Creates a new [`PropertyTypeSender`] and [`PropertyTypeReceiver`] pair.
///
/// The `chunk_size` parameter is used to batch the rows into chunks of the given size.
pub fn property_type_channel(
    chunk_size: usize,
    metadata_sender: OntologyTypeMetadataSender,
    embedding_rx: Receiver<PropertyTypeEmbeddingRow<'static>>,
) -> (PropertyTypeSender, PropertyTypeReceiver) {
    let (schema_tx, schema_rx) = mpsc::channel(chunk_size);
    let (constrains_values_tx, constrains_values_rx) = mpsc::channel(chunk_size);
    let (constrains_properties_tx, constrains_properties_rx) = mpsc::channel(chunk_size);
    let (relations_tx, relations_rx) = mpsc::channel(chunk_size);

    (
        PropertyTypeSender {
            metadata: metadata_sender,
            schema: schema_tx,
            constrains_values: constrains_values_tx,
            constrains_properties: constrains_properties_tx,
            relations: relations_tx,
        },
        PropertyTypeReceiver {
            stream: select_all([
                schema_rx
                    .ready_chunks(chunk_size)
                    .map(PropertyTypeRowBatch::Schema)
                    .boxed(),
                constrains_values_rx
                    .ready_chunks(chunk_size)
                    .map(|values| {
                        PropertyTypeRowBatch::ConstrainsValues(
                            values.into_iter().flatten().collect(),
                        )
                    })
                    .boxed(),
                constrains_properties_rx
                    .ready_chunks(chunk_size)
                    .map(|values| {
                        PropertyTypeRowBatch::ConstrainsProperties(
                            values.into_iter().flatten().collect(),
                        )
                    })
                    .boxed(),
                relations_rx
                    .ready_chunks(chunk_size)
                    .map(|relations| {
                        PropertyTypeRowBatch::Relations(relations.into_iter().collect())
                    })
                    .boxed(),
                embedding_rx
                    .ready_chunks(chunk_size)
                    .map(PropertyTypeRowBatch::Embeddings)
                    .boxed(),
            ]),
        },
    )
}
