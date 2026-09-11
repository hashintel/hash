use core::sync::atomic::{AtomicU64, Ordering};
use std::{fs, path::PathBuf};

use zerocopy::IntoBytes as _;

use super::{Representations, SetupError};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::array::{ArrayFile, ArrayVariant, ArrayWriter, Dim},
};

/// A uniquely named file in the system temporary directory, removed on drop.
struct TempFile {
    path: PathBuf,
}

impl TempFile {
    /// Writes an f32 array file holding one `width`-component row per value, filled with it.
    fn representation_rows(values: &[f32], width: usize) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);

        let path = std::env::temp_dir().join(format!(
            "atlas-knn-report-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed),
        ));

        let file = fs::File::create(&path).expect("the temporary file should be writable");
        let mut writer = ArrayWriter::new(file, ArrayVariant::F32, &[Dim::new(width as u64)])
            .expect("the array header should write");
        for &value in values {
            writer
                .write_row(vec![value; width].as_bytes())
                .expect("a row should write");
        }
        writer.finish().expect("the array file should seal");

        Self { path }
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        drop(fs::remove_file(&self.path));
    }
}

/// Maps `written` as a fixture generation's representations.
fn representations(written: &TempFile) -> Representations {
    Representations {
        generation: "3a"
            .repeat(32)
            .parse()
            .expect("a 64-digit hex string names a generation"),
        file: ArrayFile::open(&written.path).expect("the array file should open"),
    }
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "the fixture's exactly representable values round-trip through the mapped file"
)]
fn rows_read_at_the_projector_width() {
    let written = TempFile::representation_rows(&[1.0, 2.0], PROJECTOR_DIMENSIONS);
    let opened = representations(&written);

    let rows = opened.rows().expect("projector-width rows should read");
    assert_eq!(rows.len(), 2);
    assert_eq!(rows.as_raw()[0].as_array()[0], 1.0);
    assert_eq!(rows.as_raw()[1].as_array()[PROJECTOR_DIMENSIONS - 1], 2.0);
}

#[test]
fn rows_refuse_another_width() {
    let written = TempFile::representation_rows(&[1.0, 2.0], 8);
    let opened = representations(&written);

    assert!(matches!(opened.rows(), Err(SetupError::Width)));
}
