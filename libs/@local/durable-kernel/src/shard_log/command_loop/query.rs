use error_stack::{Report, ResultExt as _};
use futures_util::future::BoxFuture;
use tokio::sync::oneshot;

use super::{
    ShardCommandError, ShardCommandHandle, ShardCommandKind,
    operation::{LoopAccess, Operation},
    run::{CommandFailure, send_reply},
};
use crate::port::QueryDomain;

struct Query<D: QueryDomain> {
    query: D::Query,
    reply: oneshot::Sender<Result<D::QueryResult, Report<ShardCommandError>>>,
}

impl<D: QueryDomain> Operation<D> for Query<D> {
    fn kind(&self) -> ShardCommandKind {
        ShardCommandKind::Query
    }

    fn run(
        self: Box<Self>,
        access: &mut dyn LoopAccess<D>,
    ) -> BoxFuture<'_, Result<(), CommandFailure>> {
        let result = send_reply(self.reply, Ok(D::answer(access.projection(), self.query)));
        Box::pin(core::future::ready(result))
    }

    fn reject(self: Box<Self>, error: Report<ShardCommandError>) {
        let _: Result<_, _> = self.reply.send(Err(error));
    }
}

impl<D: QueryDomain> ShardCommandHandle<D> {
    /// # Errors
    ///
    /// Returns an error when the command loop closes before replying.
    pub async fn query(
        &self,
        query: D::Query,
    ) -> Result<D::QueryResult, Report<ShardCommandError>> {
        let (reply, response) = oneshot::channel();
        self.send_operation(Box::new(Query::<D> { query, reply }))
            .await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::Query,
            })?
    }
}
