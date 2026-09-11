use std::fs;

use camino::{Utf8Path, Utf8PathBuf};
use uuid::Uuid;

use crate::{
    file::generation::{
        GenerationDocument, GenerationId, GenerationRoot, METADATA_FILE, ScratchDirectory,
        tests::{repository, stage_all},
    },
    integrity::Sha256Digest,
};

/// Import retains the original metadata encoding without activating the generation.
#[test]
#[expect(
    clippy::significant_drop_tightening,
    reason = "import consumes the staging guard before the assertions"
)]
fn import_original_bytes() {
    let scratch = ScratchDirectory::new(
        Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("should have a UTF-8 temporary directory")
            .join(format!("atlas-generation-import-{}", Uuid::now_v7())),
    );
    let root = GenerationRoot::new(
        scratch
            .directory("generations")
            .expect("should create the generation root"),
    )
    .expect("should open the generation root");
    let repository = repository();
    let mut bytes = serde_json::to_vec(&repository).expect("should serialize the repository");
    bytes.push(b'\n');
    assert_ne!(
        bytes,
        serde_json::to_vec_pretty(&repository).expect("should serialize the local encoding"),
        "should use a different encoding from local sealing"
    );
    let id = GenerationId::from_digest(Sha256Digest::of(&bytes));
    let document = GenerationDocument::new(id, bytes.clone())
        .expect("should verify and parse the original document");
    let staging = root.stage().expect("should create a staging directory");
    let staged_path = staging.path.clone();
    stage_all(&staging, &repository);

    let published = staging
        .import(&document)
        .expect("should publish the original document");

    assert_eq!(published.id(), id);
    let generation = root.open(id).expect("should reopen the imported identity");
    assert_eq!(generation.document().bytes(), bytes);
    assert_eq!(generation.document().repository(), &repository);
    assert_eq!(
        fs::read(generation.path().join(METADATA_FILE)).expect("should read published metadata"),
        bytes
    );
    for file in repository.files.files() {
        let path = file
            .verify(&generation)
            .expect("should preserve the artifact bytes");
        let path: &Utf8Path = path.as_ref();
        assert!(
            fs::metadata(path)
                .expect("should read artifact permissions")
                .permissions()
                .readonly(),
            "should publish read-only artifacts"
        );
    }
    assert!(
        fs::metadata(generation.path().join(METADATA_FILE))
            .expect("should read metadata permissions")
            .permissions()
            .readonly(),
        "should publish read-only metadata"
    );
    assert!(!staged_path.exists(), "should rename the staging directory");
    assert_eq!(root.current().expect("should read the local pointer"), None);
    drop(scratch);
}
