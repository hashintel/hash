use std::{
    fs::{self, File},
    io::{self, Write as _},
};

use camino::Utf8Path;
use tempfile::NamedTempFile;

use super::CanonicalGenerationError;
use crate::salt::{
    classifier::ClassifierView,
    hash::ContentHash,
    storage::mmap::{ArtifactFormat, MappedArtifact, PublishedArtifact},
};

#[derive(Debug)]
pub(super) struct ModelArtifact {
    pub content_hash: ContentHash,
    pub temperature: f64,
    mapped: MappedArtifact,
}

impl ModelArtifact {
    /// Borrows the already validated classifier parameters.
    #[inline]
    pub(super) fn classifier(&self) -> ClassifierView<'_> {
        ClassifierView::new(self.mapped.view())
            .expect("retained classifier mapping should remain valid")
    }
}

pub(super) fn inspect_model(
    path: &Utf8Path,
    format: ArtifactFormat,
) -> Result<ModelArtifact, CanonicalGenerationError> {
    let file = File::open(path)?;
    let mapped = MappedArtifact::map_immutable(file, format)?;
    let content_hash = ContentHash::digest(mapped.bytes());
    let classifier = ClassifierView::new_with_format(mapped.view(), format)?;
    Ok(ModelArtifact {
        content_hash,
        temperature: classifier.temperature(),
        mapped,
    })
}

pub(super) fn copy_model(
    source: &ModelArtifact,
    destination: &Utf8Path,
    format: ArtifactFormat,
) -> Result<PublishedArtifact, CanonicalGenerationError> {
    let parent = destination.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("model artifact {destination} has no parent directory"),
        )
    })?;
    fs::create_dir_all(parent)?;
    let mut temporary = NamedTempFile::new_in(parent)?;
    temporary.write_all(source.mapped.bytes())?;
    temporary.as_file().sync_all()?;
    let content_hash = source.content_hash;
    let reused_existing = match temporary.persist_noclobber(destination) {
        Ok(file) => {
            file.sync_all()?;
            File::open(parent)?.sync_all()?;
            false
        }
        Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => {
            let existing_file = File::open(destination)?;
            existing_file.sync_all()?;
            let existing = MappedArtifact::map_immutable(existing_file, format)?;
            if ContentHash::digest(existing.bytes()) != content_hash {
                return Err(CanonicalGenerationError::ExistingModelArtifact);
            }
            File::open(parent)?.sync_all()?;
            true
        }
        Err(error) => return Err(CanonicalGenerationError::Io(error.error)),
    };
    let mapped = MappedArtifact::map_immutable(File::open(destination)?, format)?;
    let header = mapped.view().header();
    if ContentHash::digest(mapped.bytes()) != content_hash {
        return Err(CanonicalGenerationError::ExistingModelArtifact);
    }
    Ok(PublishedArtifact {
        header,
        content_hash,
        reused_existing,
    })
}
