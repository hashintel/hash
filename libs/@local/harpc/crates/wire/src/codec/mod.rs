mod decode;
mod encode;

pub use decode::Decode;
pub use encode::{BytesEncodeError, Encode};

#[cfg(test)]
pub(crate) mod test {
    pub(crate) use super::{
        decode::test::{assert_decode, assert_encode_decode, decode_value},
        encode::test::{assert_encode, assert_encode_error, encode_value},
    };
}
