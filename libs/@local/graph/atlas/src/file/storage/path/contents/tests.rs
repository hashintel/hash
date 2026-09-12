use core::pin::pin;
use std::io;

use bytes::Bytes;
use tokio::io::{AsyncBufReadExt as _, AsyncReadExt as _};
use tokio_util::io::StreamReader;

use super::FileContents;
use crate::{
    file::storage::{Revision, RevisionKind},
    integrity::Sha256Digest,
};

/// A buffered read and a byte read share one position over the opened reader.
#[tokio::test]
async fn read_mixed_modes() {
    // The async stream supplies a reader that requires pinning.
    let reader = StreamReader::new(futures::stream::once(async {
        Ok::<_, io::Error>(Bytes::from_static(b"first\nlast"))
    }));
    let contents = FileContents {
        reader,
        revision: Revision(RevisionKind::Local(Sha256Digest::of(b"first\nlast"))),
    };
    let mut contents = pin!(contents);
    let mut line = Vec::new();
    contents
        .read_until(b'\n', &mut line)
        .await
        .expect("should read the buffered line");
    assert_eq!(line, b"first\n");

    let mut remaining = Vec::new();
    contents
        .read_to_end(&mut remaining)
        .await
        .expect("should read the unconsumed contents");
    assert_eq!(remaining, b"last");
}
