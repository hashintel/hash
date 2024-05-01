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
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;
    use harpc_types::{service::ServiceId, version::Version};

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        request::service::ServiceDescriptor,
    };

    #[tokio::test]
    async fn encode() {
        let service = ServiceDescriptor {
            id: ServiceId::new(0x01_02),
            version: Version {
                major: 0x03,
                minor: 0x04,
            },
        };

        assert_encode(
            &service,
            expect![[r#"
                0x01 0x02 0x03 0x04
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode(
            &[0x12, 0x34, 0x56, 0x78],
            &ServiceDescriptor {
                id: ServiceId::new(0x12_34),
                version: Version {
                    major: 0x56,
                    minor: 0x78,
                },
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    #[cfg_attr(miri, ignore)]
    async fn encode_decode(service: ServiceDescriptor) {
        assert_codec(&service, ()).await;
    }
}
