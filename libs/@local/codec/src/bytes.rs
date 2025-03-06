use core::marker::PhantomData;
use std::io::{self, Write as _};

use bytes::{BufMut as _, BytesMut};
use derive_where::derive_where;
use error_stack::{Report, ResultExt as _};
use serde::{Serialize, de::DeserializeOwned};
use tokio_util::codec::{Decoder, Encoder, LinesCodec};

/// Encodes types as JSON lines.
///
/// This encoder serializes values to JSON and appends a newline character,
/// creating a stream of JSON lines that can be efficiently processed.
///
/// # Errors
///
/// Encoding can fail with `Report<io::Error>` in these cases:
/// - if serialization to JSON fails
/// - if writing to the buffer fails
#[derive_where(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct JsonLinesEncoder<T> {
    /// We use PhantomData with fn() -> T instead of just T to ensure the encoder
    /// doesn't impose any bounds on T unnecessarily (making it covariant rather than invariant)
    _marker: PhantomData<fn() -> T>,
}

impl<T: Serialize + Send + Sync + 'static> Encoder<T> for JsonLinesEncoder<T> {
    type Error = Report<io::Error>;

    /// Encodes a value as a JSON line.
    ///
    /// Serializes the item to JSON and appends a newline character.
    ///
    /// # Errors
    ///
    /// - if serialization to JSON fails
    /// - if writing to the buffer fails
    fn encode(&mut self, item: T, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let mut writer = dst.writer();
        serde_json::to_writer(&mut writer, &item)
            .map_err(io::Error::from)
            .attach(item)?;
        writeln!(writer)?;
        Ok(())
    }
}

/// Decodes JSON lines into typed values.
///
/// This decoder reads lines from a byte stream, parses each line as JSON,
/// and converts it to the specified type.
///
/// # Examples
///
/// ```
/// use bytes::BytesMut;
/// use hash_codec::bytes::JsonLinesDecoder;
/// use serde::Deserialize;
/// use tokio_util::codec::Decoder;
///
/// #[derive(Debug, Deserialize)]
/// struct TestData {
///     value: String,
/// }
///
/// let mut decoder = JsonLinesDecoder::<TestData>::new();
/// let mut buffer = BytesMut::from(r#"{"value":"test"}"#.as_bytes());
/// let result = decoder.decode(&mut buffer);
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
#[derive_where(Debug, Default, Clone, PartialEq, Eq, Hash)]
pub struct JsonLinesDecoder<T> {
    /// The underlying line decoder
    lines: LinesCodec,
    /// Current line number for error reporting
    current_line: usize,
    /// We use PhantomData with fn() -> T instead of just T to ensure the decoder
    /// doesn't impose any bounds on T unnecessarily (making it covariant rather than invariant)
    _marker: PhantomData<fn() -> T>,
}

impl<T> JsonLinesDecoder<T> {
    /// Creates a new JSON lines decoder with default configuration.
    #[must_use]
    pub fn new() -> Self {
        Self {
            lines: LinesCodec::new(),
            current_line: 0,
            _marker: PhantomData,
        }
    }

    /// Creates a new JSON lines decoder with a maximum line length.
    ///
    /// # Arguments
    ///
    /// * `max_length` - The maximum allowed line length
    #[must_use]
    pub fn with_max_length(max_length: usize) -> Self {
        Self {
            lines: LinesCodec::new_with_max_length(max_length),
            current_line: 0,
            _marker: PhantomData,
        }
    }

    /// Returns the maximum line length that this decoder will accept.
    #[must_use]
    pub fn max_length(&self) -> usize {
        self.lines.max_length()
    }
}

impl<T: DeserializeOwned> Decoder for JsonLinesDecoder<T> {
    // `Decoder::Error` requires `From<io::Error>` so we need to use `Report<io::Error>` here.
    type Error = Report<io::Error>;
    type Item = T;

    /// Decodes a JSON line into a value of type `T`.
    ///
    /// # Errors
    ///
    /// - if reading the line fails
    /// - if the JSON content is invalid
    /// - if the JSON doesn't match type `T`
    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<T>, Self::Error> {
        self.lines
            .decode(src)
            .inspect(|_| {
                self.current_line += 1;
            })
            .map_err(io::Error::other)?
            .filter(|line| !line.is_empty())
            .map(|line| {
                serde_json::from_str(&line)
                    .map_err(io::Error::from)
                    .attach_printable_lazy(|| format!("line in input: {}", self.current_line))
                    .attach_printable_lazy(|| line.clone())
            })
            .transpose()
    }

    /// Decodes any remaining data when the stream has ended.
    ///
    /// # Errors
    ///
    /// - if reading the line fails
    /// - if the JSON content is invalid
    /// - if the JSON doesn't match type `T`
    fn decode_eof(&mut self, buf: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        self.lines
            .decode_eof(buf)
            .inspect(|_| {
                self.current_line += 1;
            })
            .map_err(io::Error::other)?
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

#[cfg(test)]
mod tests {
    use serde::{Deserialize, Serialize};

    use super::*;

    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct TestItem {
        id: u32,
        name: String,
    }

    #[test]
    fn encode_decode_single_item() {
        // Setup
        let test_item = TestItem {
            id: 1,
            name: "test".to_owned(),
        };
        let mut encoder = JsonLinesEncoder::<TestItem>::default();
        let mut decoder = JsonLinesDecoder::<TestItem>::new();
        let mut buffer = BytesMut::new();

        // Encode
        encoder
            .encode(test_item.clone(), &mut buffer)
            .expect("Failed to encode");

        // Decode
        let decoded_item = decoder
            .decode(&mut buffer)
            .expect("Failed to decode")
            .expect("No item decoded");

        // Verify
        assert_eq!(test_item, decoded_item);
        assert!(
            decoder
                .decode(&mut buffer)
                .expect("Failed to decode")
                .is_none(),
            "Should have no more items"
        );
    }

    #[test]
    fn encode_decode_multiple_items() {
        // Setup
        let test_items = vec![
            TestItem {
                id: 1,
                name: "one".to_owned(),
            },
            TestItem {
                id: 2,
                name: "two".to_owned(),
            },
            TestItem {
                id: 3,
                name: "three".to_owned(),
            },
        ];

        let mut encoder = JsonLinesEncoder::<TestItem>::default();
        let mut decoder = JsonLinesDecoder::<TestItem>::new();
        let mut buffer = BytesMut::new();

        // Encode all items
        for item in &test_items {
            encoder
                .encode(item.clone(), &mut buffer)
                .expect("Failed to encode");
        }

        // Decode and verify each item
        for expected_item in &test_items {
            let decoded_item = decoder
                .decode(&mut buffer)
                .expect("Failed to decode")
                .expect("No item decoded");
            assert_eq!(expected_item, &decoded_item);
        }

        // Verify we've consumed everything
        assert!(
            decoder
                .decode(&mut buffer)
                .expect("Failed to decode")
                .is_none(),
            "Should have no more items"
        );
    }

    #[test]
    fn decode_incomplete_data() {
        // Setup
        let mut decoder = JsonLinesDecoder::<TestItem>::new();

        // Partial JSON (no closing brace)
        let mut buffer = BytesMut::from(br#"{"id":1,"name":"test"#.as_slice());

        // Should return None (not enough data)
        assert!(
            decoder
                .decode(&mut buffer)
                .expect("Failed to decode")
                .is_none()
        );

        // Complete the JSON with correct structure and add newline
        buffer.extend_from_slice(br#""}"#);
        buffer.extend_from_slice(b"\n");

        // Now should decode successfully
        let decoded_item = decoder
            .decode(&mut buffer)
            .expect("Failed to decode")
            .expect("No item decoded");
        assert_eq!(
            TestItem {
                id: 1,
                name: "test".to_owned()
            },
            decoded_item
        );
    }

    #[test]
    fn max_length() {
        // Setup
        let max_length = 20;
        let decoder = JsonLinesDecoder::<TestItem>::with_max_length(max_length);

        // Verify max length is set correctly
        assert_eq!(max_length, decoder.max_length());
    }

    #[test]
    fn decode_malformed_json() {
        // Setup
        let mut decoder = JsonLinesDecoder::<TestItem>::new();
        let mut buffer = BytesMut::from(br#"{"id":1,"name":test}"#.as_slice());
        buffer.extend_from_slice(b"\n");

        // Attempt to decode malformed JSON
        let result = decoder.decode(&mut buffer);

        // Should return an error and discard it since we only care that it errors
        let _: error_stack::Report<std::io::Error> =
            result.expect_err("Expected a JSON parsing error");
    }
}
