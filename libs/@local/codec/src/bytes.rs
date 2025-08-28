//! JSON lines encoding and decoding for streaming data processing.
//!
//! This module provides encoders and decoders for processing streams of JSON data
//! using the JSON Lines format (also known as NDJSON - Newline Delimited JSON).
//! Each JSON value is serialized on a separate line, making it ideal for streaming
//! and processing large volumes of data incrementally.
//!
//! # Key Components
//!
//! - [`JsonLinesEncoder`]: Serializes values to JSON and appends newlines
//! - [`JsonLinesDecoder`]: Reads newline-delimited JSON and deserializes into typed values
//!
//! # Examples
//!
//! ```
//! use bytes::BytesMut;
//! use hash_codec::bytes::{JsonLinesDecoder, JsonLinesEncoder};
//! use serde::{Deserialize, Serialize};
//! use tokio_util::codec::{Decoder, Encoder};
//!
//! #[derive(Debug, Serialize, Deserialize, PartialEq)]
//! struct Message {
//!     id: u32,
//!     content: String,
//! }
//!
//! // Create encoder and buffer
//! let mut encoder = JsonLinesEncoder::<Message>::default();
//! let mut buffer = BytesMut::new();
//!
//! // Encode a message
//! let message = Message {
//!     id: 1,
//!     content: "Hello".to_string(),
//! };
//! encoder.encode(message, &mut buffer)?;
//!
//! // Decode the message
//! let mut decoder = JsonLinesDecoder::<Message>::new();
//! let decoded = decoder.decode(&mut buffer)?;
//! # Ok::<_, Box<dyn std::error::Error>>(())
//! ```

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
/// # Performance
///
/// - Time complexity: O(n) where n is the size of the serialized JSON
/// - Memory usage: Limited to temporary buffers during serialization
/// - Optimized for streaming: Writes directly to the output buffer without intermediate allocations
///
/// # Errors
///
/// Encoding can fail with `Report<io::Error>` in these cases:
/// - if serialization to JSON fails
/// - if writing to the buffer fails
#[derive_where(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct JsonLinesEncoder<T> {
    /// We use `PhantomData` with `fn() -> T` instead of just `T` to ensure the decoder
    /// doesn't impose any bounds on `T` unnecessarily (making it covariant rather than invariant)
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
            .attach_opaque(item)?;
        writeln!(writer)?;
        Ok(())
    }
}

/// Decodes JSON lines into typed values.
///
/// This decoder reads lines from a byte stream, parses each line as JSON,
/// and converts it to the specified type.
///
/// # Performance
///
/// - Time complexity: O(n) where n is the input size
/// - Memory usage: Scales with individual line length, not total input size
/// - Security note: Use `with_max_length` to limit memory consumption for untrusted inputs
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
    /// We use `PhantomData` with `fn() -> T` instead of just `T` to ensure the decoder
    /// doesn't impose any bounds on `T` unnecessarily (making it covariant rather than invariant)
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
    /// Limits the maximum length of a line to protect against memory exhaustion attacks
    /// and ensure more consistent performance.
    ///
    /// # Security & Performance
    ///
    /// Setting an appropriate `max_length` is important for:
    /// - Preventing unbounded memory usage when processing untrusted input
    /// - Protecting against denial of service attacks
    /// - Ensuring consistent performance when processing variable-sized data
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
    /// # Performance
    ///
    /// This method has time complexity dependent on the length of the line being decoded.
    /// JSON parsing complexity is approximately O(n) where n is the length of the input string.
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
                    .attach_lazy(|| format!("line in input: {}", self.current_line))
                    .attach_lazy(|| line.clone())
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
                    .attach_lazy(|| format!("line in input: {}", self.current_line))
                    .attach_lazy(|| line.clone())
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
            .expect("should successfully encode");

        // Decode
        let decoded_item = decoder
            .decode(&mut buffer)
            .expect("should successfully decode")
            .expect("should have a decoded item");

        // Verify
        assert_eq!(test_item, decoded_item);
        assert!(
            decoder
                .decode(&mut buffer)
                .expect("should successfully decode")
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
                name: "item1".to_owned(),
            },
            TestItem {
                id: 2,
                name: "item2".to_owned(),
            },
            TestItem {
                id: 3,
                name: "item3".to_owned(),
            },
        ];
        let mut encoder = JsonLinesEncoder::<TestItem>::default();
        let mut decoder = JsonLinesDecoder::<TestItem>::new();
        let mut buffer = BytesMut::new();

        // Encode all items
        for item in &test_items {
            encoder
                .encode(item.clone(), &mut buffer)
                .expect("should successfully encode");
        }

        // Decode all items
        let mut decoded_items = Vec::new();
        while let Some(item) = decoder
            .decode(&mut buffer)
            .expect("should successfully decode")
        {
            decoded_items.push(item);
        }

        // Verify
        assert_eq!(test_items, decoded_items);
    }

    #[test]
    fn decode_incomplete_data() {
        // Setup
        let mut decoder = JsonLinesDecoder::<TestItem>::new();

        // Create incomplete JSON (missing closing quote and brace)
        let mut buffer = BytesMut::from(&br#"{"id":1,"name":"incomplete"#[..]);

        // Without a newline, the decoder should return None
        let result = decoder
            .decode(&mut buffer)
            .expect("should handle incomplete data without error");
        assert!(result.is_none(), "Should not decode without newline");

        // Add the closing quote, brace, and newline
        buffer.extend_from_slice(b"\"}\n");

        // Now it should decode successfully
        let result = decoder
            .decode(&mut buffer)
            .expect("should successfully decode");
        assert!(result.is_some(), "Should decode complete data");
        let item = result.expect("should have a decoded item");
        assert_eq!(item.id, 1);
        assert_eq!(item.name, "incomplete");
    }

    #[test]
    fn max_length() {
        // Setup
        let max_length = 20;
        let decoder = JsonLinesDecoder::<TestItem>::with_max_length(max_length);

        // Verify max length setting
        assert_eq!(decoder.max_length(), max_length);
    }

    #[test]
    fn decode_malformed_json() {
        // Setup
        let mut decoder = JsonLinesDecoder::<TestItem>::new();

        // Create malformed JSON (invalid syntax with missing quotes around name)
        // The malformed part is that "name" is missing quotes - should be "name":"value"
        let mut buffer = BytesMut::from(&b"{\"id\":1,name:\"test\"}\n"[..]);

        // Try to decode the malformed JSON
        let result = decoder.decode(&mut buffer);

        // Expect an error for malformed JSON
        assert!(result.is_err(), "Should return error for malformed JSON");
        let err = result.expect_err("should have an error for malformed JSON");

        // The error should contain a message about invalid JSON syntax
        // The actual error message contains "key must be a string"
        let err_string = format!("{err:?}");
        assert!(
            err_string.contains("key must be a string"),
            "Error should indicate JSON parsing failure: {err_string}"
        );
    }

    #[test]
    fn decode_empty_buffer() {
        // Setup
        let mut decoder = JsonLinesDecoder::<TestItem>::new();
        let mut buffer = BytesMut::new();

        // Decode should return None for empty buffer
        let result = decoder
            .decode(&mut buffer)
            .expect("should handle empty buffer without error");
        assert!(result.is_none(), "Should return None for empty buffer");
    }

    #[test]
    fn decode_eof_with_partial_data() {
        // Setup
        let mut decoder = JsonLinesDecoder::<TestItem>::new();
        let mut buffer = BytesMut::from(&br#"{"id":1,"name":"incomplete"}"#[..]);

        // Call decode_eof - should return the item even without a newline
        let result = decoder
            .decode_eof(&mut buffer)
            .expect("should successfully decode at EOF");
        assert!(result.is_some(), "Should decode partial data at EOF");
        let item = result.expect("should have a decoded item");
        assert_eq!(item.id, 1);
        assert_eq!(item.name, "incomplete");
    }

    #[test]
    fn decode_with_very_large_input() {
        // Setup
        let mut decoder = JsonLinesDecoder::<TestItem>::new();

        // Create a large name (10KB)
        let large_name = "x".repeat(10_000);
        let test_item = TestItem {
            id: 999,
            name: large_name.clone(),
        };

        // Serialize to JSON manually
        let mut json =
            serde_json::to_string(&test_item).expect("should successfully serialize test item");
        json.push('\n');
        let mut buffer = BytesMut::from(json.as_bytes());

        // Decode
        let result = decoder
            .decode(&mut buffer)
            .expect("should successfully decode large input");
        assert!(result.is_some(), "Should decode large input");
        let item = result.expect("should have a decoded item");
        assert_eq!(item.id, 999);
        assert_eq!(item.name, large_name);
    }
}
