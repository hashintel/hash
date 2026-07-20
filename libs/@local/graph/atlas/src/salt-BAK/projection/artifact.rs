//! Durable serving artifacts: encoders, hub identities, and fit metadata.
//!
//! A completed fit publishes everything a serving process needs into one
//! directory:
//!
//! - `encoder-aXXX.mpk`: one trained encoder per alpha level, with de-standardization folded in so
//!   outputs are raw layout units;
//! - `hubs.json`: the stable [`EntityId`]s of the hub rows whose relations were removed at fit
//!   time, in sampled-row order;
//! - `projection-metadata.json`: the [`ProjectionMetadata`] describing the feature contract, model
//!   dimensions, and per-encoder training state.
//!
//! Every file is published through a temporary-file hotswap, and the
//! metadata is written last: a fit that dies mid-publication leaves either
//! the previous generation's metadata (pointing at the previous, still
//! intact files) or the new one (pointing at fully written files), never a
//! reference to a torn artifact.
//!
//! [`load_projection`] is the inverse: it validates the metadata contract
//! before touching any model file, so an incompatible or corrupt directory
//! is rejected without partially loading encoders.

use core::{error::Error, fmt};
use std::{fs, io};

use burn::{
    module::Module as _,
    record::{FullPrecisionSettings, NamedMpkFileRecorder, RecorderError},
    tensor::backend::Backend,
};
use camino::Utf8Path;
use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;
use type_system::knowledge::entity::id::EntityId;

use super::{
    features::StructureFeatures,
    layout::{LayoutLevel, alpha_tag},
    mlp::{FittedProjector, HIDDEN_DIM, OUTPUT_DIM, Projector},
};

/// Revision of the on-disk artifact contract.
///
/// Bump this when the feature layout, model architecture, or file formats
/// change incompatibly; [`load_projection`] refuses other revisions.
pub const ARTIFACT_FORMAT_REVISION: u32 = 1;

/// The activation recorded in metadata; consumers of exported weights must
/// apply the same function. This is the exact erf-based GELU.
const ACTIVATION: &str = "gelu-erf";

/// Order of the feature blocks within one feature row.
const FEATURE_LAYOUT: [&str; 4] = ["embedding", "neighbor_mean", "coherence", "degree"];

const METADATA_FILE: &str = "projection-metadata.json";
const HUBS_FILE: &str = "hubs.json";

/// A failure while publishing or loading serving artifacts.
#[derive(Debug)]
pub enum ArtifactError {
    /// Reading or writing an artifact file failed.
    Io(io::Error),
    /// Publishing a file over its destination failed.
    Persist(tempfile::PersistError),
    /// Metadata or hub JSON could not be serialized or parsed.
    Json(serde_json::Error),
    /// A model record could not be written or read.
    Record(RecorderError),
    /// The metadata's format revision is not supported by this build.
    UnsupportedRevision { found: u32 },
    /// The metadata's dimensions are internally inconsistent.
    FeatureDimensions { expected: usize, actual: usize },
    /// The metadata's model architecture does not match this build.
    ModelArchitecture { field: &'static str },
    /// The metadata lists no encoders.
    NoEncoders,
    /// A per-encoder standardization or RMSE value is not finite.
    InvalidEncoderMetadata { tag: String },
    /// The hub file row count does not match the metadata.
    HubCount { expected: usize, actual: usize },
    /// A loaded encoder does not accept the metadata's feature width.
    EncoderInputDimensions { expected: usize, actual: usize },
}

impl fmt::Display for ArtifactError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => formatter.write_str("failed to access serving artifacts"),
            Self::Persist(_) => formatter.write_str("failed to publish serving artifacts"),
            Self::Json(_) => formatter.write_str("failed to encode or parse artifact metadata"),
            Self::Record(_) => formatter.write_str("failed to write or read an encoder record"),
            Self::UnsupportedRevision { found } => write!(
                formatter,
                "artifact format revision {found} is not supported; this build supports \
                 {ARTIFACT_FORMAT_REVISION}"
            ),
            Self::FeatureDimensions { expected, actual } => write!(
                formatter,
                "metadata feature dimensions are inconsistent: expected {expected}, got {actual}"
            ),
            Self::ModelArchitecture { field } => write!(
                formatter,
                "metadata {field} does not match this build's encoder architecture"
            ),
            Self::NoEncoders => formatter.write_str("artifact metadata lists no encoders"),
            Self::InvalidEncoderMetadata { tag } => write!(
                formatter,
                "encoder {tag} has non-finite standardization or RMSE metadata"
            ),
            Self::HubCount { expected, actual } => write!(
                formatter,
                "hub file holds {actual} identities but metadata expects {expected}"
            ),
            Self::EncoderInputDimensions { expected, actual } => write!(
                formatter,
                "loaded encoder expects {actual}-wide features but metadata specifies {expected}"
            ),
        }
    }
}

impl Error for ArtifactError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Persist(error) => Some(error),
            Self::Json(error) => Some(error),
            Self::Record(error) => Some(error),
            Self::UnsupportedRevision { .. }
            | Self::FeatureDimensions { .. }
            | Self::ModelArchitecture { .. }
            | Self::NoEncoders
            | Self::InvalidEncoderMetadata { .. }
            | Self::HubCount { .. }
            | Self::EncoderInputDimensions { .. } => None,
        }
    }
}

impl From<io::Error> for ArtifactError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<tempfile::PersistError> for ArtifactError {
    fn from(error: tempfile::PersistError) -> Self {
        Self::Persist(error)
    }
}

impl From<serde_json::Error> for ArtifactError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<RecorderError> for ArtifactError {
    fn from(error: RecorderError) -> Self {
        Self::Record(error)
    }
}

/// The serving contract of one published fit.
///
/// Everything a serving process must reproduce at inference time lives here:
/// the feature specification (widths, neighbor cap, hash salt, and the
/// fit-time degree normalizer), the encoder architecture, and each alpha
/// level's files and standardization parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectionMetadata {
    /// See [`ARTIFACT_FORMAT_REVISION`].
    pub format_revision: u32,
    /// The embedding (MRL) width `d` the features were generated from.
    pub embedding_dimensions: usize,
    /// The full feature row width, always `2d + 2`.
    pub feature_dimensions: usize,
    /// Order of the feature blocks within one row.
    pub feature_layout: Vec<String>,
    /// Maximum number of neighbors averaged per row at fit time.
    pub neighbor_cap: usize,
    /// The SplitMix64 salt keying the capped neighbor selection.
    pub salt: u64,
    /// The fit-time degree normalizer; serving must divide `ln(1 + degree)`
    /// by this exact value.
    pub degree_normalizer: f64,
    /// Hidden layer width of every encoder.
    pub hidden_dimensions: usize,
    /// Output width of every encoder.
    pub output_dimensions: usize,
    /// Activation function applied between encoder layers.
    pub activation: String,
    /// Number of hub identities in [`Self::hubs_file`].
    pub hub_count: usize,
    /// File holding the stable hub identities, relative to the directory.
    pub hubs_file: String,
    /// One entry per fitted alpha level, in descending alpha order.
    pub encoders: Vec<EncoderMetadata>,
}

/// The files and training state of one fitted alpha level.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncoderMetadata {
    /// The blend level this encoder was distilled at.
    pub alpha: f32,
    /// The level's file tag, for example `a100`.
    pub tag: String,
    /// The encoder record file, relative to the directory.
    pub model_file: String,
    /// The layout file the encoder was distilled from, relative to the
    /// directory.
    pub layout_file: String,
    /// The best validation RMSE observed during distillation, in layout
    /// units.
    pub validation_rmse: f64,
    /// The per-axis layout mean folded into the encoder's output layer.
    pub center: [f32; 2],
    /// The per-axis layout scale folded into the encoder's output layer.
    pub scale: [f32; 2],
}

/// Publishes encoders, hub identities, and metadata into `out`.
///
/// Files are hotswapped individually and the metadata is written last; see
/// the module documentation for the resulting crash-consistency guarantee.
/// Returns the published metadata.
///
/// # Errors
///
/// Returns an error when a file cannot be written, synced, or renamed over
/// its destination, or when serialization fails. On error the previous
/// generation's files are left in place.
pub(crate) fn publish_projection<B: Backend>(
    out: impl AsRef<Utf8Path>,
    features: &StructureFeatures,
    hubs: &[EntityId],
    encoders: &[(f32, FittedProjector<B>)],
    layouts: &[LayoutLevel],
) -> Result<ProjectionMetadata, ArtifactError> {
    let out = out.as_ref();
    let recorder = NamedMpkFileRecorder::<FullPrecisionSettings>::new();

    let mut entries = Vec::with_capacity(encoders.len());
    for ((alpha, fitted), layout) in encoders.iter().zip(layouts) {
        let tag = format!("a{:03}", alpha_tag(*alpha));
        let stem = format!("encoder-{tag}");
        let model_file = format!("{stem}.mpk");
        let layout_file = layout
            .path
            .file_name()
            .expect("layout paths always carry a file name")
            .to_owned();

        publish_encoder(out, &stem, &fitted.encoder, &recorder)?;

        entries.push(EncoderMetadata {
            alpha: *alpha,
            tag,
            model_file,
            layout_file,
            validation_rmse: fitted.validation_rmse,
            center: fitted.center,
            scale: fitted.scale,
        });
    }

    publish_json(&out.join(HUBS_FILE), &hubs)?;

    let metadata = ProjectionMetadata {
        format_revision: ARTIFACT_FORMAT_REVISION,
        embedding_dimensions: features.embedding_dimensions,
        feature_dimensions: features.values.dim(),
        feature_layout: FEATURE_LAYOUT.iter().map(ToString::to_string).collect(),
        neighbor_cap: features.neighbor_cap,
        salt: features.salt,
        degree_normalizer: features.degree_normalizer,
        hidden_dimensions: HIDDEN_DIM,
        output_dimensions: OUTPUT_DIM,
        activation: ACTIVATION.to_owned(),
        hub_count: hubs.len(),
        hubs_file: HUBS_FILE.to_owned(),
        encoders: entries,
    };
    publish_json(&out.join(METADATA_FILE), &metadata)?;

    Ok(metadata)
}

/// Records an encoder to a staging file and renames it over the published
/// name.
///
/// The recorder appends its own `.mpk` extension, so staging happens under a
/// dot-prefixed stem (which the path API treats as extensionless) to keep
/// the final staged name predictable for the rename.
fn publish_encoder<B: Backend>(
    out: &Utf8Path,
    stem: &str,
    encoder: &Projector<B>,
    recorder: &NamedMpkFileRecorder<FullPrecisionSettings>,
) -> Result<(), ArtifactError> {
    let staged_stem = out.join(format!(".stage-{stem}"));
    let staged = out.join(format!(".stage-{stem}.mpk"));
    let published = out.join(format!("{stem}.mpk"));

    encoder
        .clone()
        .save_file(staged_stem.as_std_path(), recorder)?;
    // Flush file contents to disk before the rename makes them visible under
    // the published name; the rename itself never removes the previous file
    // early.
    fs::File::open(&staged)?.sync_all()?;
    fs::rename(&staged, &published)?;
    Ok(())
}

/// Serializes a value to a temporary file and hotswaps it over `path`.
fn publish_json<T: Serialize>(path: &Utf8Path, value: &T) -> Result<(), ArtifactError> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("artifact path {path} has no parent directory"),
        )
    })?;
    let temporary = NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(temporary.as_file(), value)?;
    temporary.as_file().sync_all()?;
    temporary.persist(path)?;
    Ok(())
}

/// One loaded alpha level: the folded encoder plus its standardization.
pub struct LoadedEncoder<B: Backend> {
    /// The blend level this encoder was distilled at.
    pub alpha: f32,
    /// The trained encoder; outputs are raw layout units.
    pub encoder: Projector<B>,
    /// The per-axis layout mean folded into the output layer.
    pub center: [f32; 2],
    /// The per-axis layout scale folded into the output layer.
    pub scale: [f32; 2],
    /// The recorded validation RMSE, in layout units.
    pub validation_rmse: f64,
}

impl<B: Backend> LoadedEncoder<B> {
    /// The encoder with folding undone, emitting standardized outputs.
    ///
    /// This is the weight state training uses, so it is the right warm start
    /// for a refit's first projector.
    pub fn standardized(&self, device: &B::Device) -> Projector<B> {
        self.encoder
            .clone()
            .unfold_output(self.center, self.scale, device)
    }
}

/// A fully loaded and validated artifact directory.
pub struct LoadedProjection<B: Backend> {
    /// The published serving contract.
    pub metadata: ProjectionMetadata,
    /// Stable hub identities in sampled-row order.
    pub hubs: Vec<EntityId>,
    /// The loaded encoders, in the metadata's (descending alpha) order.
    pub encoders: Vec<LoadedEncoder<B>>,
}

impl<B: Backend> LoadedProjection<B> {
    /// The loaded encoder for the given alpha level, if it was published.
    pub fn encoder(&self, alpha: f32) -> Option<&LoadedEncoder<B>> {
        let tag = alpha_tag(alpha);
        self.encoders
            .iter()
            .find(|encoder| alpha_tag(encoder.alpha) == tag)
    }
}

/// Loads and validates a published artifact directory.
///
/// The metadata contract is checked before any model file is opened: the
/// format revision, the `2d + 2` feature width, the encoder architecture,
/// and the finiteness of every per-encoder standardization. The hub count is
/// checked against the hub file, and each loaded encoder's input width is
/// checked against the metadata.
///
/// # Errors
///
/// Returns an error when a file is missing or unreadable, when the metadata
/// fails any contract check, or when a model record cannot be loaded.
pub fn load_projection<B: Backend>(
    directory: impl AsRef<Utf8Path>,
    device: &B::Device,
) -> Result<LoadedProjection<B>, ArtifactError> {
    let directory = directory.as_ref();

    let metadata: ProjectionMetadata = serde_json::from_reader(io::BufReader::new(
        fs::File::open(directory.join(METADATA_FILE))?,
    ))?;
    validate_metadata(&metadata)?;

    let hubs: Vec<EntityId> = serde_json::from_reader(io::BufReader::new(fs::File::open(
        directory.join(&metadata.hubs_file),
    )?))?;
    if hubs.len() != metadata.hub_count {
        return Err(ArtifactError::HubCount {
            expected: metadata.hub_count,
            actual: hubs.len(),
        });
    }

    let recorder = NamedMpkFileRecorder::<FullPrecisionSettings>::new();
    let mut encoders = Vec::with_capacity(metadata.encoders.len());
    for entry in &metadata.encoders {
        let encoder = Projector::<B>::new(metadata.feature_dimensions, device).load_file(
            directory.join(&entry.model_file).into_std_path_buf(),
            &recorder,
            device,
        )?;
        if encoder.input_dim() != metadata.feature_dimensions {
            return Err(ArtifactError::EncoderInputDimensions {
                expected: metadata.feature_dimensions,
                actual: encoder.input_dim(),
            });
        }
        encoders.push(LoadedEncoder {
            alpha: entry.alpha,
            encoder,
            center: entry.center,
            scale: entry.scale,
            validation_rmse: entry.validation_rmse,
        });
    }

    Ok(LoadedProjection {
        metadata,
        hubs,
        encoders,
    })
}

/// Checks the metadata contract without touching any referenced file.
fn validate_metadata(metadata: &ProjectionMetadata) -> Result<(), ArtifactError> {
    if metadata.format_revision != ARTIFACT_FORMAT_REVISION {
        return Err(ArtifactError::UnsupportedRevision {
            found: metadata.format_revision,
        });
    }
    let expected_features = metadata
        .embedding_dimensions
        .checked_mul(2)
        .and_then(|doubled| doubled.checked_add(2))
        .ok_or(ArtifactError::FeatureDimensions {
            expected: usize::MAX,
            actual: metadata.feature_dimensions,
        })?;
    if metadata.feature_dimensions != expected_features {
        return Err(ArtifactError::FeatureDimensions {
            expected: expected_features,
            actual: metadata.feature_dimensions,
        });
    }
    if metadata.feature_layout != FEATURE_LAYOUT {
        return Err(ArtifactError::ModelArchitecture {
            field: "feature_layout",
        });
    }
    if metadata.hidden_dimensions != HIDDEN_DIM {
        return Err(ArtifactError::ModelArchitecture {
            field: "hidden_dimensions",
        });
    }
    if metadata.output_dimensions != OUTPUT_DIM {
        return Err(ArtifactError::ModelArchitecture {
            field: "output_dimensions",
        });
    }
    if metadata.activation != ACTIVATION {
        return Err(ArtifactError::ModelArchitecture {
            field: "activation",
        });
    }
    if !metadata.degree_normalizer.is_finite() || metadata.degree_normalizer <= 0.0 {
        return Err(ArtifactError::ModelArchitecture {
            field: "degree_normalizer",
        });
    }
    if metadata.encoders.is_empty() {
        return Err(ArtifactError::NoEncoders);
    }
    for entry in &metadata.encoders {
        let finite = entry.validation_rmse.is_finite()
            && entry.center.iter().all(|value| value.is_finite())
            && entry
                .scale
                .iter()
                .all(|value| value.is_finite() && *value > 0.0);
        if !finite {
            return Err(ArtifactError::InvalidEncoderMetadata {
                tag: entry.tag.clone(),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use core::num::NonZero;
    use std::fs;

    use burn::{
        backend::{NdArray, ndarray::NdArrayDevice},
        tensor::{Tensor, TensorData},
    };
    use camino::Utf8Path;
    use type_system::{
        knowledge::entity::id::{EntityId, EntityUuid},
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::*;
    use crate::{
        float::FloatBytes,
        projection::{layout::LayoutLevel, mlp::FittedProjector},
    };

    type TestBackend = NdArray;

    const EMBEDDING_DIM: usize = 4;
    const FEATURE_DIM: usize = 2 * EMBEDDING_DIM + 2;

    fn device() -> NdArrayDevice {
        NdArrayDevice::Cpu
    }

    fn fitted_projector(seed: [f32; 2]) -> FittedProjector<TestBackend> {
        // Materialize the lazily initialized weights before cloning:
        // cloning an unmaterialized burn module makes every clone draw its
        // own random initialization, which is exactly the divergence this
        // fixture must not have. Trained projectors are always materialized;
        // the record round trip forces the same for this synthetic one.
        let standardized = Projector::<TestBackend>::new(FEATURE_DIM, &device());
        let standardized = Projector::<TestBackend>::new(FEATURE_DIM, &device())
            .load_record(standardized.into_record());
        let center = [seed[0], -seed[1]];
        let scale = [1.5 + seed[0].abs(), 2.5 + seed[1].abs()];
        FittedProjector {
            encoder: standardized.clone().fold_output(center, scale, &device()),
            standardized,
            validation_rmse: 0.25,
            center,
            scale,
        }
    }

    fn structure_features() -> StructureFeatures {
        StructureFeatures {
            values: FloatBytes::from_vec(
                vec![0.5; 6 * FEATURE_DIM],
                NonZero::new(FEATURE_DIM).unwrap(),
            )
            .unwrap(),
            degree_normalizer: 2.5,
            embedding_dimensions: EMBEDDING_DIM,
            neighbor_cap: 8,
            salt: 0x5EED,
        }
    }

    fn hubs() -> Vec<EntityId> {
        (0..3)
            .map(|_| EntityId {
                web_id: WebId::new(Uuid::new_v4()),
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
                draft_id: None,
            })
            .collect()
    }

    fn layout_level(out: &Utf8Path, alpha: f32, rows: usize) -> LayoutLevel {
        let tag = crate::projection::layout::alpha_tag(alpha);
        let path = out.join(format!("layout-a{tag:03}.f32"));
        let values = (0..rows * 2).map(|value| value as f32).collect::<Vec<_>>();
        let bytes = values
            .iter()
            .flat_map(|value| value.to_ne_bytes())
            .collect::<Vec<_>>();
        fs::write(&path, bytes).expect("layout file should write");
        let coordinates = FloatBytes::from_file(
            fs::File::open(&path).expect("layout file should open"),
            NonZero::new(2).unwrap(),
        )
        .expect("layout file should map");
        LayoutLevel {
            alpha,
            path,
            coordinates,
        }
    }

    fn forward(projector: &Projector<TestBackend>, rows: usize) -> Vec<f32> {
        let values = (0..rows * FEATURE_DIM)
            .map(|value| (value % 13) as f32 / 13.0 - 0.5)
            .collect::<Vec<_>>();
        projector
            .forward(Tensor::from_data(
                TensorData::new(values, [rows, FEATURE_DIM]),
                &device(),
            ))
            .into_data()
            .to_vec::<f32>()
            .expect("projection should convert")
    }

    fn publish_generation(
        out: &Utf8Path,
        rmse: f64,
    ) -> (Vec<(f32, FittedProjector<TestBackend>)>, ProjectionMetadata) {
        let mut encoders = vec![
            (1.0, fitted_projector([0.3, 0.7])),
            (0.5, fitted_projector([1.1, 0.2])),
        ];
        for (_, fitted) in &mut encoders {
            fitted.validation_rmse = rmse;
        }
        let layouts = vec![layout_level(out, 1.0, 6), layout_level(out, 0.5, 6)];
        let metadata = publish_projection(out, &structure_features(), &hubs(), &encoders, &layouts)
            .expect("publication should succeed");
        (encoders, metadata)
    }

    #[test]
    fn round_trips_encoders_hubs_and_metadata() {
        let directory = tempfile::tempdir().expect("artifact directory should open");
        let out = Utf8Path::from_path(directory.path()).expect("path should be UTF-8");
        let (encoders, metadata) = publish_generation(out, 0.25);

        assert_eq!(metadata.format_revision, ARTIFACT_FORMAT_REVISION);
        assert_eq!(metadata.feature_dimensions, FEATURE_DIM);
        assert_eq!(metadata.encoders.len(), 2);
        assert!(out.join("encoder-a100.mpk").exists());
        assert!(out.join("encoder-a050.mpk").exists());
        assert!(out.join(HUBS_FILE).exists());
        assert!(out.join(METADATA_FILE).exists());

        let loaded =
            load_projection::<TestBackend>(out, &device()).expect("loading should succeed");
        assert_eq!(loaded.hubs.len(), 3);
        assert_eq!(loaded.encoders.len(), 2);

        // Inference before and after the round trip matches within the
        // record format's full (f32) precision.
        for (fitted, loaded) in encoders.iter().zip(&loaded.encoders) {
            assert_eq!(fitted.0, loaded.alpha);
            let before = forward(&fitted.1.encoder, 5);
            let after = forward(&loaded.encoder, 5);
            for (before, after) in before.iter().zip(&after) {
                assert!(
                    (before - after).abs() <= 1e-6 * before.abs().max(1.0),
                    "round-tripped inference differs: {before} != {after}"
                );
            }
        }

        // The standardized view recovers the pre-fold weights.
        let unfolded = forward(&loaded.encoders[0].standardized(&device()), 5);
        let original = forward(&encoders[0].1.standardized, 5);
        for (unfolded, original) in unfolded.iter().zip(&original) {
            assert!((unfolded - original).abs() <= 1e-4);
        }
    }

    #[test]
    fn republishing_hotswaps_without_breaking_the_previous_generation() {
        let directory = tempfile::tempdir().expect("artifact directory should open");
        let out = Utf8Path::from_path(directory.path()).expect("path should be UTF-8");

        publish_generation(out, 0.25);
        let first = load_projection::<TestBackend>(out, &device()).expect("first load");
        assert!((first.encoders[0].validation_rmse - 0.25).abs() < 1e-9);

        publish_generation(out, 0.75);
        let second = load_projection::<TestBackend>(out, &device()).expect("second load");
        assert!((second.encoders[0].validation_rmse - 0.75).abs() < 1e-9);
    }

    #[test]
    #[cfg(unix)]
    fn publication_failure_leaves_previous_generation_intact() {
        use std::os::unix::fs::PermissionsExt as _;

        let directory = tempfile::tempdir().expect("artifact directory should open");
        let out = Utf8Path::from_path(directory.path()).expect("path should be UTF-8");
        let (encoders, _) = publish_generation(out, 0.25);
        let before = forward(&encoders[0].1.encoder, 4);

        // A read-only directory rejects the staging files, failing the
        // publication before anything is renamed over the previous files.
        fs::set_permissions(out, fs::Permissions::from_mode(0o555))
            .expect("permissions should change");
        let refreshed = vec![
            (1.0, fitted_projector([9.0, 9.0])),
            (0.5, fitted_projector([8.0, 8.0])),
        ];
        let layouts = vec![
            LayoutLevel {
                alpha: 1.0,
                path: out.join("layout-a100.f32"),
                coordinates: FloatBytes::from_vec(vec![0.0; 12], NonZero::new(2).unwrap()).unwrap(),
            },
            LayoutLevel {
                alpha: 0.5,
                path: out.join("layout-a050.f32"),
                coordinates: FloatBytes::from_vec(vec![0.0; 12], NonZero::new(2).unwrap()).unwrap(),
            },
        ];
        let result = publish_projection(out, &structure_features(), &hubs(), &refreshed, &layouts);
        fs::set_permissions(out, fs::Permissions::from_mode(0o755))
            .expect("permissions should restore");
        result.expect_err("publication into a read-only directory should fail");

        // The previous generation still loads and serves identically.
        let loaded = load_projection::<TestBackend>(out, &device())
            .expect("previous generation should remain loadable");
        let after = forward(&loaded.encoders[0].encoder, 4);
        for (before, after) in before.iter().zip(&after) {
            assert!((before - after).abs() <= 1e-6 * before.abs().max(1.0));
        }
    }

    #[test]
    fn rejects_incompatible_metadata() {
        let directory = tempfile::tempdir().expect("artifact directory should open");
        let out = Utf8Path::from_path(directory.path()).expect("path should be UTF-8");
        let (_, metadata) = publish_generation(out, 0.25);

        let corrupt = |mutate: &dyn Fn(&mut ProjectionMetadata)| {
            let mut metadata = metadata.clone();
            mutate(&mut metadata);
            publish_json(&out.join(METADATA_FILE), &metadata).expect("metadata should write");
            match load_projection::<TestBackend>(out, &device()) {
                Ok(_) => panic!("loading corrupted metadata should fail"),
                Err(error) => error,
            }
        };

        assert_matches!(
            corrupt(&|metadata| metadata.format_revision = ARTIFACT_FORMAT_REVISION + 1),
            ArtifactError::UnsupportedRevision { .. }
        ));
        assert_matches!(
            corrupt(&|metadata| metadata.feature_dimensions += 1),
            ArtifactError::FeatureDimensions { .. }
        ));
        assert_matches!(
            corrupt(&|metadata| metadata.hidden_dimensions = 7),
            ArtifactError::ModelArchitecture {
                field: "hidden_dimensions"
            }
        ));
        assert_matches!(
            corrupt(&|metadata| metadata.activation = "relu".to_owned()),
            ArtifactError::ModelArchitecture {
                field: "activation"
            }
        ));
        assert_matches!(
            corrupt(&|metadata| metadata.encoders.clear()),
            ArtifactError::NoEncoders
        ));
        assert_matches!(
            corrupt(&|metadata| metadata.hub_count = 17),
            ArtifactError::HubCount {
                expected: 17,
                actual: 3
            }
        ));
        assert_matches!(
            corrupt(&|metadata| metadata.encoders[0].scale = [0.0, 1.0]),
            ArtifactError::InvalidEncoderMetadata { .. }
        ));
        assert_matches!(
            corrupt(&|metadata| metadata.encoders[0].model_file = "missing.mpk".to_owned()),
            ArtifactError::Record(_)
        ));

        // Restore valid metadata: the directory loads again.
        publish_json(&out.join(METADATA_FILE), &metadata).expect("metadata should restore");
        load_projection::<TestBackend>(out, &device()).expect("restored metadata should load");
    }
}
