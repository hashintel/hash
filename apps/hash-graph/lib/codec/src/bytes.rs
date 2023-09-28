use std::{
    io::{self, Write},
    marker::PhantomData,
};

use derive_where::derive_where;
use error_stack::{Report, ResultExt};
use serde::{de::DeserializeOwned, Serialize};
use tokio_util::{
    bytes::{BufMut, BytesMut},
    codec::{Decoder, Encoder, LinesCodec},
};

#[derive_where(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct JsonLinesEncoder<T> {
    _marker: PhantomData<fn() -> T>,
}

impl<T: Serialize + Send + Sync + 'static> Encoder<T> for JsonLinesEncoder<T> {
    type Error = Report<io::Error>;

    fn encode(&mut self, item: T, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let mut writer = dst.writer();
        serde_json::to_writer(&mut writer, &item)
            .map_err(io::Error::from)
            .attach(item)?;
        writeln!(writer)?;
        Ok(())
    }
}

#[derive_where(Debug, Default, Clone, PartialEq, Eq, Hash)]
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

    #[must_use]
    pub fn max_length(&self) -> usize {
        self.lines.max_length()
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
                    .attach_printable_lazy(|| format!("line in input: {}", self.current_line))
                    .attach_printable_lazy(|| line.clone())
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
                    .attach_printable_lazy(|| format!("line in input: {}", self.current_line))
                    .attach_printable_lazy(|| line.clone())
            })
            .transpose()
    }
}
