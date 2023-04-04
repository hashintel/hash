use std::{
    io::{self, Write},
    marker::PhantomData,
};

use bytes::{BufMut, BytesMut};
use derivative::Derivative;
use error_stack::{IntoReport, Report};
use serde::{de::DeserializeOwned, Serialize};
use tokio_util::codec::{Decoder, Encoder, LinesCodec};

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct JsonLinesEncoder;

impl<T: Serialize> Encoder<T> for JsonLinesEncoder {
    type Error = Report<io::Error>;

    fn encode(&mut self, item: T, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let mut writer = dst.writer();
        serde_json::to_writer(&mut writer, &item).map_err(io::Error::from)?;
        writeln!(writer)?;
        Ok(())
    }
}

#[derive(Derivative)]
#[derivative(
    Debug(bound = ""),
    Default(bound = ""),
    Clone(bound = ""),
    Eq(bound = ""),
    PartialEq(bound = ""),
    Hash(bound = "")
)]
pub struct JsonLinesDecoder<T> {
    lines: LinesCodec,
    _marker: PhantomData<fn() -> T>,
}

impl<T: DeserializeOwned> Decoder for JsonLinesDecoder<T> {
    // `Decoder::Error` requires `From<io::Error>` so we need to use `Report<io::Error>` here.
    type Error = Report<io::Error>;
    type Item = T;

    fn decode(&mut self, buf: &mut BytesMut) -> Result<Option<T>, Self::Error> {
        self.lines
            .decode(buf)
            .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_str(&line).map_err(io::Error::from))
            .transpose()
            .into_report()
    }

    fn decode_eof(&mut self, buf: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        self.lines
            .decode_eof(buf)
            .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_str(&line).map_err(io::Error::from))
            .transpose()
            .into_report()
    }
}
