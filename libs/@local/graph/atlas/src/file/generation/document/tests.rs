use core::assert_matches;
use std::fs;

use super::{
    super::{
        GenerationId, METADATA_FILE, OpenError,
        tests::{repository, root},
    },
    GenerationDocument,
};
use crate::integrity::Sha256Digest;

/// Opening a generation keeps the published bytes, and transfer reuses their allocation.
#[test]
fn read_original_encoding() {
    let (_scratch, root) = root();
    let repository = repository();
    let mut bytes = serde_json::to_vec(&repository).expect("the repository should serialize");
    bytes.extend_from_slice(b" \n\t");
    let id = GenerationId(Sha256Digest::of(&bytes));
    let path = root.generation_path(id);
    fs::create_dir_all(&path).expect("the generation directory should create");
    fs::write(path.join(METADATA_FILE), &bytes).expect("the metadata should write");

    let generation = root.open(id).expect("the original document should open");
    let document = generation.document();

    assert_eq!(document.id(), id);
    assert_eq!(document.bytes(), bytes);
    assert_eq!(document.repository(), &repository);
    assert_eq!(generation.id(), id);
    assert_eq!(generation.repository(), &repository);

    let allocation = document.bytes().as_ptr();
    let transferred = generation.into_document().into_bytes();
    assert_eq!(transferred.as_ref(), bytes);
    assert_eq!(
        transferred.as_ptr(),
        allocation,
        "should reuse the original JSON allocation"
    );
}

/// Identity verification refuses bytes that hash to another generation, before any parsing.
#[test]
fn new_identity_mismatch() {
    let bytes = b"not json".to_vec();
    let actual = Sha256Digest::of(&bytes);
    let expected = GenerationId(Sha256Digest::of(b"another document"));

    let error = GenerationDocument::new(expected, bytes)
        .expect_err("identity verification should precede parsing");

    assert_matches!(error, OpenError::Identity { id, actual: received } if id == expected && received == actual);
}

/// A matching identity still requires bytes that parse as a repository.
#[test]
fn new_invalid_document() {
    let bytes = b"not json".to_vec();
    let id = GenerationId(Sha256Digest::of(&bytes));

    let error = GenerationDocument::new(id, bytes)
        .expect_err("a matching identity should still require a valid repository");

    assert_matches!(error, OpenError::Document(_));
}

/// Absent metadata reads as unpublished, and an unreadable path reports its I/O failure.
#[test]
fn read_unavailable() {
    let (_scratch, root) = root();
    let id = GenerationId(Sha256Digest::of(b"missing document"));
    assert_matches!(root.open(id), Err(OpenError::Unpublished(missing)) if missing == id);

    fs::create_dir_all(root.generation_path(id).join(METADATA_FILE))
        .expect("the metadata-path obstruction should create");

    assert_matches!(root.open(id), Err(OpenError::Io(_)));
}
