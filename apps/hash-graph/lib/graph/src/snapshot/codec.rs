use std::{
    io::{self, Write},
    marker::PhantomData,
};

use bytes::{BufMut, BytesMut};
use derivative::Derivative;
use error_stack::Report;
use memchr::memchr;
use serde::{de::DeserializeOwned, Serialize};
use tokio_util::codec::{Decoder, Encoder};

#[derive(Derivative)]
#[derivative(
    Debug(bound = ""),
    Default(bound = ""),
    Copy(bound = ""),
    Clone(bound = ""),
    Eq(bound = ""),
    PartialEq(bound = ""),
    Hash(bound = "")
)]
pub struct JsonLines<T> {
    _marker: PhantomData<fn() -> T>,
}

impl<T: Serialize> Encoder<T> for JsonLines<T> {
    type Error = Report<io::Error>;

    fn encode(&mut self, item: T, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let mut writer = dst.writer();
        serde_json::to_writer(&mut writer, &item).map_err(io::Error::from)?;
        writeln!(writer)?;
        Ok(())
    }
}

impl<T: DeserializeOwned> Decoder for JsonLines<T> {
    type Error = Report<io::Error>;
    type Item = T;

    fn decode(&mut self, buf: &mut BytesMut) -> Result<Option<T>, Self::Error> {
        memchr(b'\n', buf)
            .map(|offset| {
                let line = buf.split_to(offset + 1);
                Ok(serde_json::from_slice(&line).map_err(io::Error::from)?)
            })
            .transpose()
    }
}
