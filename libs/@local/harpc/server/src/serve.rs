use futures::{Stream, StreamExt};
use harpc_net::session::server::Transaction;
use harpc_tower::{
    body::server::request::RequestBody,
    net::pack::Pack,
    request::{self, Request},
    response::BoxedResponse,
};
use tokio::pin;
use tokio_util::task::TaskTracker;
use tower::{Service, ServiceExt};

// TODO: do we want `BoxedResponse` to be `!`? or is there a better way of doing this? We could have
// a body that takes any E and converts it to a `!` error (by adding a `TransactionError` and
// terminating)
pub async fn serve<M, S>(
    stream: impl Stream<Item = Transaction> + Send,
    mut make_service: M,
) -> TaskTracker
where
    M: Service<(), Response = S, Error = !, Future: Send> + Send,
    S: Service<Request<RequestBody>, Response = BoxedResponse<!>, Error = !, Future: Send>
        + Send
        + 'static,
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
        let request = Request::new(parts, RequestBody::new(stream));

        let Ok(service): Result<S, !> = make_service.call(()).await;

        tasks.spawn(async move {
            let Ok(response): Result<BoxedResponse<!>, !> = service.oneshot(request).await;
            let response = response.into_body();

            let pack = Pack::new(response).map(Ok);
            if let Err(error) = pack.forward(sink).await {
                tracing::error!(?error, "failed to send response");
            }
        });
    }

    tasks.close();
    tasks
}
