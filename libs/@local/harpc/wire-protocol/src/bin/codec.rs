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
//! encode request begin|
//! ```

fn main() {
    let mut args = std::env::args().collect::<Vec<_>>();
    args.reverse();

    args.pop()
        .expect("the first argument should be the command invoked");

    let command = args
        .pop()
        .expect("the second argument should be the direction");

    match command.to_lowercase() {}
}
