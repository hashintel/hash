use std::io;

use error_stack::Result;
use harpc_types::{service::ServiceId, version::Version};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    pin,
};

use crate::codec::{Decode, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ServiceDescriptor {
    pub id: ServiceId,
    pub version: Version,
}

impl Encode for ServiceDescriptor {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        self.id.encode(&mut write).await?;
        self.version.encode(write).await
    }
}

impl Decode for ServiceDescriptor {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        let id = ServiceId::decode(&mut read, ()).await?;
        let version = Version::decode(read, ()).await?;

        Ok(Self { id, version })
    }
}

#[cfg(test)]
mod test {
    use expect_test::expect;
    use harpc_types::{service::ServiceId, version::Version};

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        request::service::ServiceDescriptor,
    };

    #[tokio::test]
    async fn encode() {
        let service = ServiceDescriptor {
            id: ServiceId::new(0x1234),
            version: Version::new(0x56, 0x78),
        };

        assert_encode(&service, expect![[""]]).await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode::<ServiceDescriptor>(&[0x12, 0x34, 0x56, 0x78], expect![[""]], ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(service: ServiceDescriptor) {
        assert_codec(&service, ()).await;
    }
}
