use std::{future::Future, marker::PhantomData, mem::size_of};


use integer_encoding::VarInt;
use tokio::io::{AsyncRead, AsyncReadExt};


use crate::harpc::{
    transport::{
        codec::Limit,
    },
};

pub(in crate::harpc) async fn default_decode_text<T, U>(
    io: &mut T,
    limit: Limit,
) -> std::io::Result<U>
where
    T: AsyncRead + Unpin + Send,
    U: serde::de::DeserializeOwned,
{
    let mut buf = Vec::new();

    io.take(limit.request_size).read_to_end(&mut buf).await?;

    let request = serde_json::from_slice(&buf)?;

    Ok(request)
}

/// [`VarIntProcessor`] encapsulates the logic for decoding a VarInt byte-by-byte.
/// "borrowed" from integer-encoding crate
struct VarIntProcessor<T> {
    buffer: [u8; 10],
    index: usize,

    _marker: PhantomData<fn() -> *const T>,
}

impl<T> VarIntProcessor<T>
where
    T: VarInt,
{
    #[allow(clippy::integer_division)]
    // taken from https://github.com/dermesser/integer-encoding-rs/blob/4f57046ae90b6b923ff235a91f0729d3cf868d72/src/varint.rs#L75
    const MAX_SIZE: usize = (size_of::<T>() * 8 + 7) / 7;

    fn new() -> Self {
        Self {
            buffer: [0_u8; 10],
            index: 0,
            _marker: PhantomData,
        }
    }

    fn push(&mut self, byte: u8) -> std::io::Result<()> {
        if self.index >= Self::MAX_SIZE {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Unterminated variable integer",
            ));
        }

        self.buffer[self.index] = byte;
        self.index += 1;

        Ok(())
    }

    const fn finished(&self) -> bool {
        const MSB: u8 = 0b1000_0000;

        self.index > 0 && (self.buffer[self.index - 1] & MSB == 0)
    }

    fn decode(&self) -> Option<T> {
        Some(T::decode_var(&self.buffer[0..self.index])?.0)
    }
}

pub(in crate::harpc) async fn read_varint<T, U>(io: &mut T) -> std::io::Result<U>
where
    T: AsyncRead + Unpin + Send,
    U: VarInt,
{
    let mut processor = VarIntProcessor::new();

    while !processor.finished() {
        // we only error on EOF, in that case we need to bail
        // even if we would encounter an EOF while reading the next byte of input
        // the processor has indicated we're not finished yet, so it's a premature EOF anyway.
        let byte = io.read_u8().await?;
        processor.push(byte)?;
    }

    processor.decode().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Unterminated variable integer",
        )
    })
}

pub(in crate::harpc) trait DecodeBinary: Sized {
    fn decode_binary<T>(
        io: &mut T,
        limit: Limit,
    ) -> impl Future<Output = std::io::Result<Self>> + Send
    where
        T: AsyncRead + Unpin + Send;
}

pub(in crate::harpc) trait DecodeText: DecodeBinary {
    fn decode_text<T>(
        io: &mut T,
        limit: Limit,
    ) -> impl Future<Output = std::io::Result<Self>> + Send
    where
        T: AsyncRead + Unpin + Send;
}

#[cfg(test)]
mod test {
    

    
    

    use crate::harpc::{
        transport::{
            codec::{
                decode::{read_varint},
            },
        },
    };

    #[tokio::test]
    async fn unterminated_varint_too_long() {
        let buffer = [0xFF_u8; 12];

        let result = read_varint::<_, u64>(&mut &buffer[..]).await;

        result.expect_err("should fail to read varint");
    }

    #[tokio::test]
    async fn unterminated_varint_premature_eof() {
        let buffer = [0xFF_u8, 0xFF];

        let result = read_varint::<_, u64>(&mut &buffer[..]).await;

        result.expect_err("should fail to read varint");
    }
}
