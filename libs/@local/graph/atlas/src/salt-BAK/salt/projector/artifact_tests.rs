use burn::backend::{NdArray, ndarray::NdArrayDevice};
use camino::Utf8PathBuf;
use tempfile::tempdir;

use super::{
    ConditionedProjector, ProjectorCheckpointError, ProjectorConfig, ProjectorError,
    load_projector_checkpoint, publish_projector_checkpoint,
};

#[test]
fn checkpoint_rejects_payload_tensor_shapes_hidden_by_compatible_envelope() {
    let device = NdArrayDevice::Cpu;
    let recorded = ProjectorConfig {
        width: 8,
        residual_blocks: 1,
        role_dimensions: 2,
        ..ProjectorConfig::default()
    };
    let expected = ProjectorConfig {
        width: 16,
        ..recorded
    };
    let path = checkpoint(&recorded, &device);
    rewrite_header_u64(&path, 16, expected.width);

    let error = load_projector_checkpoint::<NdArray>(&path, expected, &device)
        .expect_err("payload tensor dimensions must be inspected after record loading");

    assert_matches!(
        error,
        ProjectorCheckpointError::Architecture(ProjectorError::LoadedMatrixShape { .. })
    ));
}

#[test]
fn checkpoint_turns_payload_block_count_mismatch_into_typed_error() {
    let device = NdArrayDevice::Cpu;
    let recorded = ProjectorConfig {
        width: 8,
        residual_blocks: 1,
        role_dimensions: 2,
        ..ProjectorConfig::default()
    };
    let expected = ProjectorConfig {
        residual_blocks: 2,
        ..recorded
    };
    let path = checkpoint(&recorded, &device);
    rewrite_header_u64(&path, 24, expected.residual_blocks);

    let error = load_projector_checkpoint::<NdArray>(&path, expected, &device)
        .expect_err("payload block-count mismatch must not unwind across the loader");

    assert_matches!(
        error,
        ProjectorCheckpointError::RecordStructure
            | ProjectorCheckpointError::Architecture(ProjectorError::LoadedBlockCount { .. })
    ));
}

fn checkpoint(config: &ProjectorConfig, device: &NdArrayDevice) -> Utf8PathBuf {
    let directory = tempdir().expect("temporary directory should exist");
    let root = directory.keep();
    let path = Utf8PathBuf::from_path_buf(root.join("projector.mpk"))
        .expect("temporary path should be UTF-8");
    let model = ConditionedProjector::<NdArray>::new(*config, device)
        .expect("architecture should validate");
    publish_projector_checkpoint(&path, &model).expect("checkpoint should publish");
    path
}

fn rewrite_header_u64(path: &Utf8PathBuf, offset: usize, value: usize) {
    let mut bytes = std::fs::read(path).expect("checkpoint should remain readable");
    bytes[offset..offset + 8].copy_from_slice(
        &u64::try_from(value)
            .expect("fixture architecture value should fit u64")
            .to_le_bytes(),
    );
    std::fs::write(path, bytes).expect("fixture envelope should be mutable");
}
