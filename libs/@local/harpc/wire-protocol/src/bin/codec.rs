//! Simply CLI that is used to validate a wire protocol implementation.
//!
//! Validation for encoding is done by taking the base64 encoded output and returning the decoded
//! JSON representation.
//!
//! Validation for the decoding is done by taking a JSON representation and returning the base64,
//! which is then decoded. by the client.
//!
//! CLI usage:
//!
//! ```bash
//! encode request-header
//! ```

use core::fmt;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use bytes::Bytes;
use harpc_wire_protocol::{
    codec::{Buffer, Decode},
    request::{
        Request, begin::RequestBegin, body::RequestBody, frame::RequestFrame, header::RequestHeader,
    },
};

fn decode<T>(args: &mut Vec<String>)
where
    T: Decode<Context = ()> + serde::Serialize + fmt::Debug,
{
    let value = args
        .pop()
        .expect("third argument should be a base64 encoded string");

    let mut bytes = Bytes::from(BASE64_STANDARD.encode(&value));
    let mut buffer = Buffer::new(&mut bytes);

    let header = T::decode(&mut buffer, ()).expect("input should represent a valid value");

    serde_json::to_writer(std::io::stdout(), &header)
        .expect("should be able to write json to stdout");
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
                    decode::<RequestHeader>(&mut args);
                }
                "request-begin" => {
                    decode::<RequestBegin>(&mut args);
                }
                "request-frame" => {
                    decode::<RequestFrame>(&mut args);
                }
                // We cannot test the `request-body` separately as it needs context from the
                // `request` to work.
                "request" => {
                    decode::<Request>(&mut args);
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
