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
use postgres_types::Json;
use type_system::PropertyType;
use uuid::Uuid;

use crate::{
    identifier::ontology::OntologyTypeVersion,
    snapshot::{
        ontology::{
            property_type::batch::PropertyTypeRowBatch,
            table::{
                PropertyTypeConstrainsPropertiesOnRow, PropertyTypeConstrainsValuesOnRow,
                PropertyTypeRow,
            },
            OntologyTypeMetadataSender,
        },
        OntologyTypeSnapshotRecord, SnapshotRestoreError,
    },
};

/// A sink to insert [`OntologyTypeSnapshotRecord`]s with `T` being an [`PropertyType`].
///
/// An `PropertyTypeSender` with the corresponding [`PropertyTypeReceiver`] are created using the
/// [`property_type_channel`] function.
#[derive(Debug, Clone)]
pub struct PropertyTypeSender {
    metadata: OntologyTypeMetadataSender,
    schema: Sender<PropertyTypeRow>,
    constrains_values: Sender<Vec<PropertyTypeConstrainsValuesOnRow>>,
    constrains_properties: Sender<Vec<PropertyTypeConstrainsPropertiesOnRow>>,
}

// This is a direct wrapper around several `Sink<mpsc::Sender>` and `OntologyTypeMetadataSender`
// with error-handling added to make it easier to use. It's taking an `OntologyTypeSnapshotRecord`
// and sending the individual rows to the corresponding sinks.
impl Sink<OntologyTypeSnapshotRecord<PropertyType>> for PropertyTypeSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_ready_unpin(cx))
            .attach_printable("could not poll ontology type sender")?;
        ready!(self.schema.poll_ready_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll schema sender")?;
        ready!(self.constrains_values.poll_ready_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll constrains values edge sender")?;
        ready!(self.constrains_properties.poll_ready_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll constrains properties edge sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        ontology_type: OntologyTypeSnapshotRecord<PropertyType>,
    ) -> Result<(), Self::Error> {
        let property_type = PropertyType::try_from(ontology_type.schema)
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not convert schema to property type")?;

        let ontology_id = Uuid::new_v4();

        self.metadata
            .start_send_unpin((ontology_id, ontology_type.metadata))
            .attach_printable("could not send metadata")?;

        let values: Vec<_> = property_type
            .data_type_references()
            .into_iter()
            .map(|data_type_ref| {
                let url = data_type_ref.url();
                PropertyTypeConstrainsValuesOnRow {
                    source_property_type_ontology_id: ontology_id,
                    target_data_type_base_url: url.base_url.as_str().to_owned(),
                    target_data_type_version: OntologyTypeVersion::new(url.version),
                }
            })
            .collect();
        if !values.is_empty() {
            self.constrains_values
                .start_send_unpin(values)
                .into_report()
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send constrains values edge")?;
        }

        let properties: Vec<_> = property_type
            .property_type_references()
            .into_iter()
            .map(|property_type_ref| {
                let url = property_type_ref.url();
                PropertyTypeConstrainsPropertiesOnRow {
                    source_property_type_ontology_id: ontology_id,
                    target_property_type_base_url: url.base_url.as_str().to_owned(),
                    target_property_type_version: OntologyTypeVersion::new(url.version),
                }
            })
            .collect();
        if !properties.is_empty() {
            self.constrains_properties
                .start_send_unpin(properties)
                .into_report()
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send constrains properties edge")?;
        }

        self.schema
            .start_send_unpin(PropertyTypeRow {
                ontology_id,
                schema: Json(property_type.into()),
            })
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send schema")?;

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_flush_unpin(cx))
            .attach_printable("could not flush ontology type sender")?;
        ready!(self.schema.poll_flush_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush schema sender")?;
        ready!(self.constrains_values.poll_flush_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush constrains values edge sender")?;
        ready!(self.constrains_properties.poll_flush_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush constrains properties edge sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_close_unpin(cx))
            .attach_printable("could not close ontology type sender")?;
        ready!(self.schema.poll_close_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close schema sender")?;
        ready!(self.constrains_values.poll_close_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close constrains values edge sender")?;
        ready!(self.constrains_properties.poll_close_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close constrains properties edge sender")?;

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
) -> (PropertyTypeSender, PropertyTypeReceiver) {
    let (schema_tx, schema_rx) = mpsc::channel(chunk_size);
    let (constrains_values_tx, constrains_values_rx) = mpsc::channel(chunk_size);
    let (constrains_properties_tx, constrains_properties_rx) = mpsc::channel(chunk_size);

    (
        PropertyTypeSender {
            metadata: metadata_sender,
            schema: schema_tx,
            constrains_values: constrains_values_tx,
            constrains_properties: constrains_properties_tx,
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
            ]),
        },
    )
}
