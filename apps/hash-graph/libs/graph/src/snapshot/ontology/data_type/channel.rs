use std::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use authorization::schema::{DataTypeId, DataTypeRelationAndSubject};
use error_stack::{Report, ResultExt};
use futures::{
    channel::mpsc::{self, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};
use postgres_types::Json;
use uuid::Uuid;

use crate::snapshot::{
    ontology::{
        data_type::batch::DataTypeRowBatch, table::DataTypeRow, DataTypeSnapshotRecord,
        OntologyTypeMetadataSender,
    },
    SnapshotRestoreError,
};

/// A sink to insert [`DataTypeSnapshotRecord`]s.
///
/// An `DataTypeSender` with the corresponding [`DataTypeReceiver`] are created using the
/// [`data_type_channel`] function.
#[derive(Debug, Clone)]
pub struct DataTypeSender {
    metadata: OntologyTypeMetadataSender,
    schema: Sender<DataTypeRow>,
    relations: Sender<(DataTypeId, Vec<DataTypeRelationAndSubject>)>,
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
        ready!(self.relations.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        data_type: DataTypeSnapshotRecord,
    ) -> Result<(), Self::Error> {
        let record_id = data_type.metadata.record_id.to_string();
        let ontology_id = Uuid::new_v5(&Uuid::NAMESPACE_URL, record_id.as_bytes());

        self.metadata
            .start_send_unpin((ontology_id, data_type.metadata))
            .attach_printable("could not send metadata")?;
        self.schema
            .start_send_unpin(DataTypeRow {
                ontology_id,
                schema: Json(data_type.schema),
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send schema")?;

        self.relations
            .start_send_unpin((DataTypeId::new(ontology_id), data_type.relations))
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
pub fn data_type_channel(
    chunk_size: usize,
    metadata_sender: OntologyTypeMetadataSender,
) -> (DataTypeSender, DataTypeReceiver) {
    let (schema_tx, schema_rx) = mpsc::channel(chunk_size);
    let (relations_tx, relations_rx) = mpsc::channel(chunk_size);

    (
        DataTypeSender {
            metadata: metadata_sender,
            schema: schema_tx,
            relations: relations_tx,
        },
        DataTypeReceiver {
            stream: select_all([
                schema_rx
                    .ready_chunks(chunk_size)
                    .map(DataTypeRowBatch::Schema)
                    .boxed(),
                relations_rx
                    .ready_chunks(chunk_size)
                    .map(|relations| {
                        DataTypeRowBatch::Relations(
                            relations
                                .into_iter()
                                .flat_map(|(id, relations)| {
                                    relations.into_iter().map(move |relation| (id, relation))
                                })
                                .collect(),
                        )
                    })
                    .boxed(),
            ]),
        },
    )
}
