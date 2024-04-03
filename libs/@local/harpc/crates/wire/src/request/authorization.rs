use std::io;

use error_stack::Result;
use graph_types::account::AccountId;
use tokio::io::{AsyncRead, AsyncWrite};

use crate::codec::{DecodePure, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct Authorization {
    #[cfg_attr(test, strategy(crate::codec::test::account_id_strategy()))]
    pub account: AccountId,
}

impl Encode for Authorization {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.account.encode(write).await
    }
}

impl DecodePure for Authorization {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        Ok(Self {
            account: AccountId::decode_pure(read).await?,
        })
    }
}

#[cfg(test)]
mod test {
    use graph_types::account::AccountId;
    use uuid::Uuid;

    use super::Authorization;
    use crate::codec::test::{assert_decode, assert_encode, assert_encode_decode};

    #[tokio::test]
    async fn encode() {
        let id = Uuid::new_v4();
        let account = Authorization {
            account: AccountId::new(id),
        };

        assert_encode(&account, id.as_bytes()).await;
    }

    #[tokio::test]
    async fn decode() {
        let id = Uuid::new_v4();

        let account = Authorization {
            account: AccountId::new(id),
        };

        assert_decode(id.as_bytes(), &account, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(authorization: Authorization) {
        assert_encode_decode(&authorization, ()).await;
    }
}
