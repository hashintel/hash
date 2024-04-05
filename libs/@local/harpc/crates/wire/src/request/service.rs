use std::io;

use error_stack::Result;
use harpc_types::service::{ServiceId, ServiceVersion};
use tokio::io::{AsyncRead, AsyncWrite};

use crate::codec::{DecodePure, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ServiceDescriptor {
    pub id: ServiceId,
    pub version: ServiceVersion,
}

impl Encode for ServiceDescriptor {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.id.encode(&mut write).await?;
        self.version.encode(write).await
    }
}

impl DecodePure for ServiceDescriptor {
    type Error = io::Error;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let id = ServiceId::decode_pure(&mut read).await?;
        let version = ServiceVersion::decode_pure(read).await?;

        Ok(Self { id, version })
    }
}

#[cfg(test)]
mod test {
    use harpc_types::service::{ServiceId, ServiceVersion};

    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        request::service::ServiceDescriptor,
    };

    #[tokio::test]
    async fn encode() {
        let service = ServiceDescriptor {
            id: ServiceId::new(0x1234),
            version: ServiceVersion::new(0x56, 0x78),
        };

        assert_encode(&service, &[0x12, 0x34, 0x56, 0x78]).await;
    }

    #[tokio::test]
    async fn decode() {
        let service = ServiceDescriptor {
            id: ServiceId::new(0x1234),
            version: ServiceVersion::new(0x56, 0x78),
        };

        assert_decode(&[0x12, 0x34, 0x56, 0x78], &service, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(service: ServiceDescriptor) {
        assert_encode_decode(&service, ()).await;
    }
}
