use std::{
    fs::{self, File},
    io::{BufWriter, Write as _},
};

use camino::{Utf8Path, Utf8PathBuf};
use serde::{Serialize, Serializer, ser::SerializeSeq as _};
use tempfile::NamedTempFile;
use uuid::Uuid;

use super::error::GenerationError;
use crate::salt::{
    evaluation::QuantizedCanonicalField,
    hash::{ContentHash, hash_reader},
    identity::IdentityDirectory,
};

const OUTPUT_BUFFER_BYTES: usize = 1024 * 1024;

/// A legacy alpha filename tag in the closed `a000..a100` range.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct LegacyLayoutTag(u16);

impl LegacyLayoutTag {
    /// Creates a compatibility filename tag.
    ///
    /// # Errors
    ///
    /// This returns an error when `value` exceeds 100.
    pub(crate) const fn new(value: u16) -> Result<Self, GenerationError> {
        if value <= 100 {
            Ok(Self(value))
        } else {
            Err(GenerationError::InvalidLegacyTag { value })
        }
    }
}

/// One immutable file emitted for legacy evaluation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LegacyExportFile {
    pub path: Utf8PathBuf,
    pub content_hash: ContentHash,
    pub byte_length: u64,
    pub reused_existing: bool,
}

/// Layout, identity mapping, and discoverability manifest for legacy readers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LegacyCanvasExport {
    pub layout: LegacyExportFile,
    pub identities: LegacyExportFile,
    pub manifest: LegacyExportFile,
}

#[derive(Serialize)]
#[serde(deny_unknown_fields)]
struct LegacyExportManifest<'name> {
    version: u32,
    tag: u16,
    condition: f64,
    quantization_step: f64,
    coordinate_field_hash: ContentHash,
    row_count: usize,
    layout_file: &'name str,
    layout_hash: ContentHash,
    identities_file: &'name str,
    identities_hash: ContentHash,
}

#[derive(Serialize)]
#[serde(deny_unknown_fields)]
struct IdentityDocument<'identity> {
    version: u32,
    rows: IdentityRows<'identity>,
}

struct IdentityRows<'identity>(&'identity IdentityDirectory);

impl Serialize for IdentityRows<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut sequence = serializer.serialize_seq(Some(self.0.len()))?;
        for (row, entity_id) in self.0.iter() {
            let web_id: Uuid = entity_id.web_id.into();
            let entity_uuid: Uuid = entity_id.entity_uuid.into();
            let draft_id = entity_id.draft_id.map(Into::<Uuid>::into);
            sequence.serialize_element(&IdentityRow {
                row: row.as_u32(),
                web_id,
                entity_uuid,
                draft_id,
            })?;
        }
        sequence.end()
    }
}

#[derive(Serialize)]
#[serde(deny_unknown_fields)]
struct IdentityRow {
    row: u32,
    web_id: Uuid,
    entity_uuid: Uuid,
    draft_id: Option<Uuid>,
}

/// Exports canonical coordinates through the legacy little-endian layout path.
///
/// `layout-aXXX.f32` remains row-compatible with the previous canvas evaluator.
/// A separate JSON identity map makes the internal generation row explicit,
/// including draft identity when present. The small manifest is published last
/// and is therefore the discoverability marker for the two data files.
///
/// # Errors
///
/// This returns an error for an invalid tag, inconsistent rows, a coordinate
/// that cannot be represented as finite `f32`, failed encoding or I/O, or a
/// different file already occupying any destination.
pub(crate) fn export_legacy_canvas(
    output: &Utf8Path,
    tag: LegacyLayoutTag,
    identities: &IdentityDirectory,
    field: &QuantizedCanonicalField,
) -> Result<LegacyCanvasExport, GenerationError> {
    if identities.len() != field.coordinates().len() {
        return Err(GenerationError::LegacyRowCount {
            identities: identities.len(),
            coordinates: field.coordinates().len(),
        });
    }
    fs::create_dir_all(output)?;
    let layout_name = format!("layout-a{:03}.f32", tag.0);
    let identities_name = format!("salt-identities-a{:03}.json", tag.0);
    let manifest_name = format!("salt-export-a{:03}.json", tag.0);

    let layout = publish_file(&output.join(&layout_name), |writer| {
        for (row, coordinate) in field.coordinates().iter().enumerate() {
            for (axis, &value) in coordinate.iter().enumerate() {
                #[expect(
                    clippy::cast_possible_truncation,
                    reason = "legacy coordinate representability is checked after conversion"
                )]
                let value_f32 = value as f32;
                if !value.is_finite() || !value_f32.is_finite() {
                    return Err(GenerationError::LegacyCoordinate { row, axis, value });
                }
                writer.write_all(&value_f32.to_le_bytes())?;
            }
        }
        Ok(())
    })?;
    let identities_file = publish_file(&output.join(&identities_name), |writer| {
        serde_json::to_writer(
            writer,
            &IdentityDocument {
                version: 1,
                rows: IdentityRows(identities),
            },
        )?;
        Ok(())
    })?;
    let manifest_document = LegacyExportManifest {
        version: 2,
        tag: tag.0,
        condition: field.selection().condition().get(),
        quantization_step: field.quantization_step(),
        coordinate_field_hash: field.content_hash(),
        row_count: identities.len(),
        layout_file: &layout_name,
        layout_hash: layout.content_hash,
        identities_file: &identities_name,
        identities_hash: identities_file.content_hash,
    };
    let manifest = publish_file(&output.join(manifest_name), |writer| {
        serde_json::to_writer(writer, &manifest_document)?;
        Ok(())
    })?;
    Ok(LegacyCanvasExport {
        layout,
        identities: identities_file,
        manifest,
    })
}

/// Publishes one immutable opaque artifact with no-clobber idempotency.
pub(crate) fn publish_opaque_file(
    path: &Utf8Path,
    bytes: &[u8],
) -> Result<LegacyExportFile, GenerationError> {
    publish_file(path, |writer| {
        writer.write_all(bytes)?;
        Ok(())
    })
}

fn publish_file(
    path: &Utf8Path,
    encode: impl FnOnce(&mut dyn std::io::Write) -> Result<(), GenerationError>,
) -> Result<LegacyExportFile, GenerationError> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("legacy export path {path} has no parent"),
        )
    })?;
    let mut temporary = NamedTempFile::new_in(parent)?;
    {
        let mut writer = BufWriter::with_capacity(OUTPUT_BUFFER_BYTES, temporary.as_file_mut());
        encode(&mut writer)?;
        writer.flush()?;
    }
    temporary.as_file().sync_all()?;
    let content_hash = hash_reader(temporary.reopen()?)?;
    let length = temporary.as_file().metadata()?.len();
    let reused_existing = match temporary.persist_noclobber(path) {
        Ok(file) => {
            file.sync_all()?;
            File::open(parent)?.sync_all()?;
            false
        }
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
            let existing = File::open(path)?;
            existing.sync_all()?;
            let existing_length = existing.metadata()?.len();
            let existing_hash = hash_reader(existing)?;
            if existing_length != length || existing_hash != content_hash {
                return Err(GenerationError::ExistingLegacyExport {
                    path: path.to_owned(),
                });
            }
            File::open(parent)?.sync_all()?;
            true
        }
        Err(error) => return Err(error.into()),
    };
    Ok(LegacyExportFile {
        path: path.to_owned(),
        content_hash,
        byte_length: length,
        reused_existing,
    })
}
