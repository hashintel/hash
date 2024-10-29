use core::future::poll_fn;

use bytes::Bytes;
use futures::{Stream, StreamExt};
use harpc_codec::error::NetworkError;
use harpc_net::session::server::Transaction;
use harpc_tower::{
    body::server::request::RequestBody,
    request::{self, Request},
};
use tokio::pin;
use tokio_util::task::TaskTracker;
use tower::{MakeService, ServiceExt};

pub async fn serve<M>(
    stream: impl Stream<Item = Transaction> + Send,
    mut make_service: M,
) -> TaskTracker
where
    M: MakeService<
            (),
            Request<RequestBody>,
            Response: futures::Stream<Item = Result<Bytes, NetworkError>> + Send,
            Error = !,
            Service: tower::Service<Request<RequestBody>, Future: Send> + Send + 'static,
            MakeError = !,
            Future: Send,
        > + Send,
{
    // we're not using a JoinSet here on purpose, a TaskTracker immediately frees the memory from a
    // task, unlike a JoinSet
    let tasks = TaskTracker::new();
    pin!(stream);

    #[expect(
        clippy::significant_drop_in_scrutinee,
        reason = "Semaphore permit being dropped is expected, used for control flow in Arc"
    )]
    while let Some(transaction) = stream.next().await {
        let (context, sink, stream) = transaction.into_parts();

        let parts = request::Parts::from_transaction(&context);
        let request = Request::from_parts(parts, RequestBody::new(stream));

        let Ok(()) = poll_fn(|cx| make_service.poll_ready(cx)).await;
        let Ok(service) = make_service.make_service(()).await;

        tasks.spawn(async move {
            let Ok(stream) = service.oneshot(request).await;
            let stream = stream.map(Ok);
            pin!(stream);

            if let Err(error) = stream.forward(sink).await {
                tracing::error!(?error, "failed to send response");
            }
        });
    }

    tasks.close();
    tasks
}
