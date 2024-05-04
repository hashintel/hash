// What does the session do? It creates a new `Session`
// * (server) object for every new requestid on a connection and returns a `Transaction` object,
//   that has an `AsyncRead` + `AsyncWrite`, as well as `Session`, those are then bunched up
//   together into packets, once all connections are dropped, the session object is dropped as well.
// * (server) each connection a new `RequestId` on a request and is handled transparently
// * (server) there is a maximum number of connections that can be open at once, once the limit is
//   reached new connections are denied.
// * (server) connections are dropped if a certain timeout is reached in `AsyncRead` or `AsyncWrite`
//   calls.

mod connection;
mod session;
mod supervisor;
mod transaction;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

pub struct SessionLayer {
    tx: mpsc::Sender<self::supervisor::Command>,

    cancel: CancellationToken,
}

// should return a Stream of `Transaction<`
