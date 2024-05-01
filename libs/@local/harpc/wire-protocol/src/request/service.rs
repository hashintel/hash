use std::io;

use bytes::{Buf, BufMut};
use error_stack::Report;
use harpc_types::{service::ServiceId, version::Version};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    pin,
};

use crate::codec::{Buffer, BufferError, Decode, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ServiceDescriptor {
    pub id: ServiceId,
    pub version: Version,
}

impl Encode for ServiceDescriptor {
    type Error = !;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        let Ok(()) = self.id.encode(buffer);
        let Ok(()) = self.version.encode(buffer);

        Ok(())
    }
}

impl Decode for ServiceDescriptor {
    type Context = ();
    type Error = Report<BufferError>;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        let id = ServiceId::decode(buffer, ())?;
        let version = Version::decode(buffer, ())?;

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
    async fn encode_decode(service: ServiceDescriptor) {
        assert_codec(&service, ()).await;
    }
}
