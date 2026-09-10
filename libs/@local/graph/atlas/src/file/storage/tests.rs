use std::{env, fs};

use camino::{Utf8Path, Utf8PathBuf};
use uuid::Uuid;

pub(crate) struct TemporaryDirectory {
    path: Utf8PathBuf,
}

impl TemporaryDirectory {
    #[expect(
        clippy::create_dir,
        reason = "the fixture must refuse an existing directory rather than reuse it"
    )]
    pub(crate) fn new() -> Self {
        let path = Utf8PathBuf::from_path_buf(env::temp_dir())
            .expect("should have a UTF-8 temporary directory")
            .join(format!("atlas-storage-test-{}", Uuid::now_v7()));
        fs::create_dir(&path).expect("should create the fixture directory");
        Self { path }
    }

    pub(crate) fn path(&self) -> &Utf8Path {
        &self.path
    }

    pub(crate) fn entry_count(&self) -> usize {
        fs::read_dir(&self.path)
            .expect("should read the fixture directory")
            .count()
    }
}

impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        drop(fs::remove_dir_all(&self.path));
    }
}
