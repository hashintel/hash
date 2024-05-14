// * (client) for the client this works similarly but on a single connection, there is no `Session`,
//   but the `Connection` can be called to create new transactions, which are just request +
//   response. Once the `AsyncWrite` end is sealed(?)/dropped(?) it awaits for a response.
// * (client) I am unsure about how to go about this, because `AsyncRead` + `AsyncWrite` lack the
//   facilities to indicate end of stream easily?
pub mod client;
pub mod error;
pub mod server;
mod writer;
