use tokio::sync::oneshot;

use super::KernelProjection;

/// A typed read from a projection.
///
/// Closures also implement this trait.
pub trait ProjectionQuery<P>: Send {
    type Output: Send;

    fn answer(self, projection: &P) -> Self::Output;
}

impl<P, F, R> ProjectionQuery<P> for F
where
    F: FnOnce(&P) -> R + Send,
    R: Send,
{
    type Output = R;

    fn answer(self, projection: &P) -> Self::Output {
        self(projection)
    }
}

trait ErasedQuery<P>: Send {
    fn answer(self: Box<Self>, projection: &KernelProjection<P>);
}

struct QueryRequest<Q, R> {
    query: Q,
    reply: oneshot::Sender<R>,
}

impl<P, Q, R> ErasedQuery<P> for QueryRequest<Q, R>
where
    Q: ProjectionQuery<KernelProjection<P>, Output = R>,
    R: Send,
{
    fn answer(self: Box<Self>, projection: &KernelProjection<P>) {
        let Self { query, reply } = *self;
        drop(reply.send(query.answer(projection)));
    }
}

#[doc(hidden)]
pub struct HostedQuery<P>(Box<dyn ErasedQuery<P>>);

impl<P> HostedQuery<P> {
    pub(super) fn new<Q>(query: Q, reply: oneshot::Sender<Q::Output>) -> Self
    where
        Q: ProjectionQuery<KernelProjection<P>> + 'static,
        Q::Output: 'static,
    {
        Self(Box::new(QueryRequest { query, reply }))
    }

    pub(super) fn answer(self, projection: &KernelProjection<P>) {
        self.0.answer(projection);
    }
}
