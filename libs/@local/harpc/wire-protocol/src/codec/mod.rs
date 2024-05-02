mod buffer;
mod decode;
mod encode;
mod types;

pub use buffer::{Buffer, BufferError};
pub use decode::Decode;
pub use encode::{BytesEncodeError, Encode};

#[cfg(test)]
pub(crate) mod test {
    use bytes::Bytes;
    use proptest::collection::size_range;

    pub(crate) use super::{
        decode::test::{assert_codec, assert_decode, assert_decode_error},
        encode::test::{assert_encode, encode_value},
    };

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec_u16(value: u16) {
        assert_codec(&value, ());
    }

    // 1024 ensures that we spill over into the second length byte while still having a good
    // runtime performance.
    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec_bytes(#[any(size_range(0..1024).lift())] payload: Vec<u8>) {
        let buffer = Bytes::from(payload);

        assert_codec(&buffer, ());
    }
}
