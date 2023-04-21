use std::{
    io::{self, Write},
    marker::PhantomData,
};

use bytes::{BufMut, BytesMut};
use derivative::Derivative;
use error_stack::{IntoReport, Report, ResultExt};
use serde::{de::DeserializeOwned, Serialize};
use tokio_util::codec::{Decoder, Encoder, LinesCodec};

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
pub struct JsonLinesEncoder<T> {
    _marker: PhantomData<fn() -> T>,
}

impl<T: Serialize + Send + Sync + 'static> Encoder<T> for JsonLinesEncoder<T> {
    type Error = Report<io::Error>;

    fn encode(&mut self, item: T, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let mut writer = dst.writer();
        serde_json::to_writer(&mut writer, &item)
            .map_err(io::Error::from)
            .into_report()
            .attach(item)?;
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
    current_line: usize,
    _marker: PhantomData<fn() -> T>,
}

impl<T> JsonLinesDecoder<T> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            lines: LinesCodec::new(),
            current_line: 0,
            _marker: PhantomData,
        }
    }

    #[must_use]
    pub fn with_max_length(max_length: usize) -> Self {
        Self {
            lines: LinesCodec::new_with_max_length(max_length),
            current_line: 0,
            _marker: PhantomData,
        }
    }
}

impl<T: DeserializeOwned> Decoder for JsonLinesDecoder<T> {
    // `Decoder::Error` requires `From<io::Error>` so we need to use `Report<io::Error>` here.
    type Error = Report<io::Error>;
    type Item = T;

    fn decode(&mut self, buf: &mut BytesMut) -> Result<Option<T>, Self::Error> {
        self.lines
            .decode(buf)
            .map(|line| {
                self.current_line += 1;
                line
            })
            .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?
            .filter(|line| !line.is_empty())
            .map(|line| {
                serde_json::from_str(&line)
                    .map_err(io::Error::from)
                    .into_report()
                    .attach_printable_lazy(|| format!("line in input: {}", self.current_line))
            })
            .transpose()
    }

    fn decode_eof(&mut self, buf: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        self.lines
            .decode_eof(buf)
            .map(|line| {
                self.current_line += 1;
                line
            })
            .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?
            .filter(|line| !line.is_empty())
            .map(|line| {
                serde_json::from_str(&line)
                    .map_err(io::Error::from)
                    .into_report()
                    .attach_printable_lazy(|| format!("line in input: {}", self.current_line))
            })
            .transpose()
    }
}
