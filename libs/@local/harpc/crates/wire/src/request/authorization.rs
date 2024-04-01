use std::io;

use error_stack::Result;
use graph_types::account::AccountId;
use tokio::io::AsyncWrite;

use crate::encode::Encode;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Authorization {
    account: AccountId,
}

impl Encode for Authorization {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.account.encode(write).await
    }
}
