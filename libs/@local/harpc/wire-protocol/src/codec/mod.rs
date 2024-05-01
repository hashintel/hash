mod decode;
mod encode;
mod types;

pub use decode::Decode;
pub use encode::{BytesEncodeError, Encode};

#[cfg(test)]
pub(crate) mod test {
    use bytes::Bytes;
    use proptest::collection::size_range;

    pub(crate) use super::{
        decode::test::{assert_codec, assert_decode},
        encode::test::{assert_encode, encode_value},
    };

    #[test_strategy::proptest(async = "tokio")]
    #[cfg_attr(miri, ignore)]
    async fn codec_u16(value: u16) {
        assert_codec(&value, ()).await;
    }

    // 1024 ensures that we spill over into the second length byte while still having a good
    // runtime performance.
    #[test_strategy::proptest(async = "tokio")]
    #[cfg_attr(miri, ignore)]
    async fn codec_bytes(#[any(size_range(0..1024).lift())] payload: Vec<u8>) {
        let buffer = Bytes::from(payload);

        assert_codec(&buffer, ()).await;
    }
}
