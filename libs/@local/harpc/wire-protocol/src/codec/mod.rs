mod decode;
mod encode;
mod types;

pub use decode::{Decode, DecodePure};
pub use encode::{BytesEncodeError, Encode};

#[cfg(test)]
pub(crate) mod test {
    use bytes::Bytes;
    use graph_types::account::AccountId;
    use proptest::{arbitrary::Arbitrary, collection::size_range, strategy::Strategy};
    use uuid::Builder;

    pub(crate) use super::{
        decode::test::{assert_decode, assert_encode_decode, decode_value},
        encode::test::{assert_encode, encode_value},
    };

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_u16(value: u16) {
        assert_encode_decode(&value, ()).await;
    }

    fn uuid_strategy() -> impl Strategy<Value = uuid::Uuid> {
        <[u8; 16]>::arbitrary().prop_map(|bytes| Builder::from_random_bytes(bytes).into_uuid())
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_uuid(#[strategy(uuid_strategy())] value: uuid::Uuid) {
        assert_encode_decode(&value, ()).await;
    }

    pub(crate) fn account_id_strategy() -> impl Strategy<Value = graph_types::account::AccountId> {
        uuid_strategy().prop_map(AccountId::new)
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_account_id(#[strategy(account_id_strategy())] value: AccountId) {
        assert_encode_decode(&value, ()).await;
    }

    // 1024 ensures that we spill over into the second length byte while still having a good
    // runtime performance.
    #[test_strategy::proptest(async = "tokio")]
    async fn codec_bytes(#[any(size_range(0..1024).lift())] payload: Vec<u8>) {
        let buffer = Bytes::from(payload);

        assert_encode_decode(&buffer, ()).await;
    }
}
