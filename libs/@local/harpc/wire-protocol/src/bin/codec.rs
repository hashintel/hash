//! Wire protocol implementation validator CLI.
//!
//! This CLI tool validates the encoding and decoding of a wire protocol implementation,
//! used by other language implementations to verify correctness.
//!
//! # Encoding Validation
//!
//! Decodes a base64 encoded input and returns the JSON representation.
//! The implementation is correct if the JSON output matches the original input which was used to
//! generate the binary representation of the binary protocol by the foreign language
//! implementation.
//!
//! This means:
//!
//! ∀ A: (E(A) = Binary) ∧ (D(Binary) = B) ⇒ A ≡ B.
//!
//! Where:
//! - A is the original input.
//! - B is the decoded output.
//! - Binary is the encoded representation.
//! - E is the encoding function from the foreign language implementation.
//! - D is the decoding function from the CLI.
//! - ≡ denotes logical equivalence.
//!
//! # Decoding Validation
//!
//! Encodes a JSON input to base64 and returns the encoded output.
//!
//! The implementation is correct if the JSON output matches the output which the foreign language
//! implementation from parsing the binary representation used as input to the command.
//!
//! This means:
//!
//! ∀ Binary: (E(Binary) = A) ∧ (D(Binary) = B) ⇒ A ≡ B.
//!
//! Where:
//!
//! - Binary is the encoded representation.
//! - A is the output of the foreign language implementation.
//! - B is the output of this CLI.
//! - E is the decoding function from the foreign language implementation.
//! - D is the decoding function from the CLI.
//! - → denotes the transformation process.
//! - ≡ denotes logical equivalence.
//!
//! # Usage
//!
//! ```
//! validator encode <type> <base64_input>
//! validator decode <type> <json_input>
//! ```
//!
//! Where `<type>` is one of:
//! - request-header (encode only)
//! - request-begin (encode only)
//! - request-frame (encode only)
//! - request (encode only)
//! - response-header (decode only)
//! - response-begin (decode only)
//! - response-frame (decode only)
//! - response-body (decode only)
//! - response (decode only)
#![allow(clippy::print_stdout)]

use core::fmt;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use bytes::{Bytes, BytesMut};
use harpc_wire_protocol::{
    codec::{Buffer, Decode, Encode},
    request::{Request, begin::RequestBegin, frame::RequestFrame, header::RequestHeader},
    response::{
        Response, begin::ResponseBegin, body::ResponseBody, frame::ResponseFrame,
        header::ResponseHeader,
    },
};

fn validate_encode<T>(args: &mut Vec<String>)
where
    T: Decode<Context = ()> + serde::Serialize + fmt::Debug,
{
    let value = args
        .pop()
        .expect("third argument should be a base64 encoded string");

    let bytes = BASE64_STANDARD
        .decode(&value)
        .expect("input should be valid base64");
    let mut bytes = Bytes::from(bytes);
    let mut buffer = Buffer::new(&mut bytes);

    let header = T::decode(&mut buffer, ()).expect("input should represent a valid value");

    serde_json::to_writer(std::io::stdout(), &header)
        .expect("should be able to write json to stdout");
}

fn validate_decode<T>(args: &mut Vec<String>)
where
    T: Encode + serde::de::DeserializeOwned + fmt::Debug,
{
    let value = args
        .pop()
        .expect("third argument should be a JSON encoded string");

    let header: T = serde_json::from_str(&value).expect("input should represent a valid value");

    let mut bytes = BytesMut::new();
    let mut buffer = Buffer::new(&mut bytes);

    header
        .encode(&mut buffer)
        .expect("should be able to encode the value");

    let base64 = BASE64_STANDARD.encode(&bytes);
    println!("{base64}");
}

fn main() {
    let mut args = std::env::args().collect::<Vec<_>>();
    args.reverse();

    args.pop()
        .expect("the first argument should be the command invoked");

    let command = args
        .pop()
        .expect("the second argument should be one of encode or decode");

    match &*command.to_lowercase() {
        "encode" => {
            let r#type = args.pop().expect(
                "second argument should be one of request-header, request-begin, request-frame, \
                 or request",
            );

            match &*r#type.to_lowercase() {
                "request-header" => {
                    validate_encode::<RequestHeader>(&mut args);
                }
                "request-begin" => {
                    validate_encode::<RequestBegin>(&mut args);
                }
                "request-frame" => {
                    validate_encode::<RequestFrame>(&mut args);
                }
                // We cannot test the `request-body` separately as it needs context from the
                // `request` to work.
                "request" => {
                    validate_encode::<Request>(&mut args);
                }
                _ => {
                    panic!("unknown type: {type}");
                }
            }
        }
        "decode" => {
            let r#type = args.pop().expect(
                "second argument should be one of response-header, response-begin, \
                 response-frame, response-body, or response",
            );

            match &*r#type.to_lowercase() {
                "response-header" => {
                    validate_decode::<ResponseHeader>(&mut args);
                }
                "response-begin" => {
                    validate_decode::<ResponseBegin>(&mut args);
                }
                "response-frame" => {
                    validate_decode::<ResponseFrame>(&mut args);
                }
                "response-body" => {
                    validate_decode::<ResponseBody>(&mut args);
                }
                "response" => {
                    validate_decode::<Response>(&mut args);
                }
                _ => {
                    panic!("unknown type: {type}");
                }
            }
        }
        _ => {
            panic!("unknown command: {command}");
        }
    }
}
