use std::{
    pin::Pin,
    result::Result as StdResult,
    task::{ready, Context, Poll},
};

use authorization::schema::WebRelationAndSubject;
use error_stack::{Report, ResultExt};
use futures::{
    channel::mpsc::{self, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};
use graph_types::{provenance::OwnedById, web::WebId};

use crate::snapshot::{
    web::{WebBatch, WebRow},
    SnapshotRestoreError, Web,
};

/// A sink to insert [`Web`]s.
///
/// An `WebSender` with the corresponding [`WebReceiver`] are created using the [`channel`]
/// function.
#[derive(Debug, Clone)]
pub struct WebSender {
    webs: Sender<WebRow>,
    relations: Sender<(WebId, WebRelationAndSubject)>,
}

impl Sink<Web> for WebSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.webs.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll webs sender")?;
        ready!(self.relations.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll web relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(mut self: Pin<&mut Self>, web: Web) -> StdResult<(), Self::Error> {
        self.webs
            .start_send_unpin(WebRow {
                web_id: OwnedById::new(web.id.into_uuid()),
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send webs")?;
        for relation_and_subject in web.relations {
            self.relations
                .start_send_unpin((web.id, relation_and_subject))
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send web relations")?;
        }
        Ok(())
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.webs.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush webs sender")?;
        ready!(self.relations.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush web relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.webs.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close webs sender")?;
        ready!(self.relations.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close web relations sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to emit [`WebBatch`]es.
///
/// An [`WebSender`] with the corresponding `WebReceiver` are created using the [`channel`]
/// function.
pub struct WebReceiver {
    stream: SelectAll<BoxStream<'static, WebBatch>>,
}

// This is a direct wrapper around `Stream<mpsc::Receiver<WebBatch>>` with error-handling and
// batching added
impl Stream for WebReceiver {
    type Item = WebBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Creates a new [`WebSender`] and [`WebReceiver`] pair.
///
/// The `chunk_size` parameter determines the number of ids are sent in a single batch.
pub fn channel(chunk_size: usize) -> (WebSender, WebReceiver) {
    let (webs_tx, webs_rx) = mpsc::channel(chunk_size);
    let (web_relations_tx, web_relations_rx) = mpsc::channel(chunk_size);

    (
        WebSender {
            webs: webs_tx,
            relations: web_relations_tx,
        },
        WebReceiver {
            stream: select_all([
                webs_rx.ready_chunks(chunk_size).map(WebBatch::Webs).boxed(),
                web_relations_rx
                    .ready_chunks(chunk_size)
                    .map(WebBatch::Relations)
                    .boxed(),
            ]),
        },
    )
}
