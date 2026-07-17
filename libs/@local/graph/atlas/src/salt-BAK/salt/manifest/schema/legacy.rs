//! Validation of legacy canvas compatibility exports.

#![expect(
    clippy::little_endian_bytes,
    reason = "legacy identity validation recomputes the canonical cross-platform row encoding"
)]

use core::mem::size_of;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::salt::{
    hash::{ContentHash, ContentHasher},
    manifest::{ArtifactRole, GenerationManifest},
    storage::mmap::{ArtifactView, SectionId},
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct IdentityDocument {
    version: u32,
    rows: Vec<IdentityRow>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct IdentityRow {
    row: u32,
    web_id: Uuid,
    entity_uuid: Uuid,
    draft_id: Option<Uuid>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyExportManifest {
    version: u32,
    tag: u16,
    condition: f64,
    quantization_step: f64,
    coordinate_field_hash: ContentHash,
    row_count: usize,
    layout_file: String,
    layout_hash: ContentHash,
    identities_file: String,
    identities_hash: ContentHash,
}

pub(super) fn validate(
    role: ArtifactRole,
    bytes: &[u8],
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    match role {
        ArtifactRole::LegacyLayout => validate_layout(bytes, manifest),
        ArtifactRole::LegacyIdentities => validate_identities(bytes, manifest),
        ArtifactRole::LegacyExportManifest => validate_export_manifest(bytes, manifest),
        ArtifactRole::ProjectorCheckpoint => Ok(()),
        ArtifactRole::Representations
        | ArtifactRole::RelationClassifier
        | ArtifactRole::StrengthHead
        | ArtifactRole::SemanticGraph
        | ArtifactRole::RelationIndexes
        | ArtifactRole::LandmarkSkeleton
        | ArtifactRole::LandmarkReferencePersistence
        | ArtifactRole::CanonicalBase
        | ArtifactRole::CanonicalAnalytics
        | ArtifactRole::RepresentationReport
        | ArtifactRole::SemanticFidelityReport
        | ArtifactRole::RelationPolicyReport
        | ArtifactRole::MergeTreePersistenceReport
        | ArtifactRole::SubgroupBehaviorReport
        | ArtifactRole::AuthorizationNoninterferenceReport
        | ArtifactRole::SecurityApprovalReport
        | ArtifactRole::CompanionPinReport => {
            Err("mapped artifact was routed through the opaque legacy validator")
        }
    }
}

pub(super) fn validate_layout_coordinates(
    layout: &[u8],
    canonical_base: ArtifactView<'_>,
) -> Result<(), &'static str> {
    let rows = canonical_base
        .section(SectionId::new(1))
        .ok_or("canonical base is missing its row identifier section")?
        .as_u32()
        .map_err(|_error| "canonical base row identifiers have the wrong scalar type")?;
    let coordinates = canonical_base
        .section(SectionId::new(2))
        .ok_or("canonical base is missing its coordinate section")?
        .as_bytes();
    let coordinate_bytes = 2 * size_of::<f32>();
    let expected = rows
        .len()
        .checked_mul(coordinate_bytes)
        .ok_or("canonical base coordinate length overflows")?;
    if coordinates.len() != expected || layout.len() != coordinates.len() {
        return Err("legacy layout and canonical base coordinate shapes differ");
    }
    for (index, row) in rows.iter().copied().enumerate() {
        let row = usize::try_from(row).map_err(|_error| "canonical base row does not fit usize")?;
        let source = index * coordinate_bytes;
        let source_end = source
            .checked_add(coordinate_bytes)
            .ok_or("canonical base coordinate offset overflows")?;
        let target = row
            .checked_mul(coordinate_bytes)
            .ok_or("legacy layout row offset overflows")?;
        let target_end = target
            .checked_add(coordinate_bytes)
            .ok_or("legacy layout coordinate offset overflows")?;
        if layout.get(target..target_end) != coordinates.get(source..source_end) {
            return Err("legacy layout does not contain the canonical base coordinates");
        }
    }
    Ok(())
}

fn validate_layout(bytes: &[u8], manifest: &GenerationManifest) -> Result<(), &'static str> {
    let rows = usize::try_from(manifest.storage.row_count)
        .map_err(|_error| "legacy row count does not fit usize")?;
    let expected = rows
        .checked_mul(2)
        .and_then(|coordinates| coordinates.checked_mul(size_of::<f32>()))
        .ok_or("legacy layout length overflows")?;
    if bytes.len() != expected
        || bytes.chunks_exact(size_of::<f32>()).any(|value| {
            !f32::from_le_bytes(
                value
                    .try_into()
                    .expect("exact f32 chunks should contain four bytes"),
            )
            .is_finite()
        })
    {
        return Err("legacy layout shape or coordinate is invalid");
    }
    Ok(())
}

fn validate_identities(bytes: &[u8], manifest: &GenerationManifest) -> Result<(), &'static str> {
    let document: IdentityDocument =
        serde_json::from_slice(bytes).map_err(|_error| "legacy identities JSON is invalid")?;
    if document.version != 1
        || document.rows.len()
            != usize::try_from(manifest.storage.row_count)
                .map_err(|_error| "legacy row count does not fit usize")?
        || serde_json::to_vec(&document)
            .map_err(|_error| "legacy identities JSON cannot be canonicalized")?
            != bytes
    {
        return Err("legacy identities schema or canonical encoding is invalid");
    }
    let mut identity = ContentHasher::new(b"hash.graph.atlas.salt.identity-directory.v1");
    for (position, row) in document.rows.iter().enumerate() {
        if usize::try_from(row.row).ok() != Some(position) {
            return Err("legacy identity rows are not dense and ordered");
        }
        identity.update(&row.row.to_le_bytes());
        identity.update(row.web_id.as_bytes());
        identity.update(row.entity_uuid.as_bytes());
        if let Some(draft_id) = row.draft_id {
            identity.update(&[1]);
            identity.update(draft_id.as_bytes());
        } else {
            identity.update(&[0]);
            identity.update(&[0; 16]);
        }
    }
    if identity.finish() != manifest.storage.identity_directory_hash {
        return Err("legacy identities differ from the generation identity directory");
    }
    Ok(())
}

fn validate_export_manifest(
    bytes: &[u8],
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    let export: LegacyExportManifest =
        serde_json::from_slice(bytes).map_err(|_error| "legacy export JSON is invalid")?;
    if export.version != 2
        || export.tag > 100
        || serde_json::to_vec(&export)
            .map_err(|_error| "legacy export JSON cannot be canonicalized")?
            != bytes
    {
        return Err("legacy export schema or canonical encoding is invalid");
    }
    let canonical = manifest
        .variants
        .entries
        .iter()
        .find(|entry| entry.id == manifest.variants.canonical_variant)
        .ok_or("canonical variant is missing")?;
    let layout = artifact(manifest, ArtifactRole::LegacyLayout)?;
    let identities = artifact(manifest, ArtifactRole::LegacyIdentities)?;
    let expected_layout = format!("layout-a{:03}.f32", export.tag);
    let expected_identities = format!("salt-identities-a{:03}.json", export.tag);
    let expected_manifest = format!("salt-export-a{:03}.json", export.tag);
    let actual_manifest = artifact(manifest, ArtifactRole::LegacyExportManifest)?;
    if !same_float(export.condition, canonical.global_relation_condition)
        || !same_float(export.quantization_step, canonical.quantization_step)
        || export.coordinate_field_hash != canonical.canonical_field_hash
        || u64::try_from(export.row_count).ok() != Some(manifest.storage.row_count)
        || export.layout_file != expected_layout
        || export.identities_file != expected_identities
        || layout.relative_path != expected_layout
        || identities.relative_path != expected_identities
        || actual_manifest.relative_path != expected_manifest
        || export.layout_hash != layout.content_hash
        || export.identities_hash != identities.content_hash
    {
        return Err("legacy export manifest differs from generation artifacts");
    }
    Ok(())
}

#[inline]
const fn same_float(left: f64, right: f64) -> bool {
    left.to_bits() == right.to_bits()
}

fn artifact(
    manifest: &GenerationManifest,
    role: ArtifactRole,
) -> Result<&crate::salt::manifest::ArtifactManifest, &'static str> {
    manifest
        .artifacts
        .iter()
        .find(|artifact| artifact.role == role)
        .ok_or("legacy export artifact is missing")
}
