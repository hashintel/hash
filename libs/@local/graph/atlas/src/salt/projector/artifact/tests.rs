//! Certificates for the checkpoint artifacts.
//!
//! Bit-exact round-trips across backends, and every open-path verification naming its failure.
//!
//! Forward-equality assertions are bit-exact by design. The record stores every f32 parameter at
//! full precision, so a round-tripped model must compute the identical function. Any deviation
//! breaks the round-trip rather than merely losing precision.

use core::num::NonZero;

use burn::{
    backend::{Autodiff, NdArray, ndarray::NdArrayDevice},
    module::{AutodiffModule as _, Module as _},
    record::{FullPrecisionSettings, NamedMpkBytesRecorder, Recorder as _},
    tensor::{Int, Tensor, TensorData},
};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{CheckpointError, ResumeRecord, open_model, open_resume, write_model};
use crate::salt::projector::model::{Architecture, Dimension, Layer, Projector, ProjectorInput};

type TestBackend = Autodiff<NdArray>;

fn device() -> NdArrayDevice {
    NdArrayDevice::default()
}

fn nonzero(value: usize) -> NonZero<usize> {
    NonZero::new(value).expect("test dimensions should be nonzero")
}

fn architecture() -> Architecture {
    Architecture {
        width: nonzero(8),
        residual_blocks: nonzero(2),
        representation_dimensions: nonzero(6),
        role_dimensions: nonzero(4),
        condition_dimensions: nonzero(1),
    }
}

fn model(seed: u64) -> Projector<TestBackend> {
    Projector::new(
        architecture(),
        &device(),
        Xoshiro256PlusPlus::seed_from_u64(seed),
    )
}

/// Projects a small varied batch to comparable values.
fn probe<B: burn::tensor::backend::Backend<FloatElem = f32>>(
    model: &Projector<B>,
    device: &B::Device,
) -> Vec<f32> {
    let rows = 3;
    let representation = (0..rows * 6)
        .map(|index| {
            #[expect(
                clippy::cast_precision_loss,
                reason = "test indexes are tiny and exactly representable"
            )]
            let index = index as f32;
            index.mul_add(0.375, -1.5)
        })
        .collect::<Vec<_>>();
    let output = model.forward(ProjectorInput {
        representation: Tensor::from_data(TensorData::new(representation, [rows, 6]), device),
        roles: Tensor::<B, 1, Int>::from_data(TensorData::new(vec![0_i64, 1, 2], [rows]), device),
        condition: Tensor::from_data(TensorData::new(vec![0.5_f32; rows], [rows, 1]), device),
    });
    output
        .into_data()
        .to_vec()
        .expect("projector outputs should convert to f32 values")
}

/// A structurally valid resume record around the given overrides.
fn resume_record() -> ResumeRecord<TestBackend> {
    ResumeRecord {
        model: model(7).into_record(),
        // A fresh optimizer carries no moments until its first step,
        // so the empty map is the boundary state of a zero-length
        // opening segment.
        optimizer: <_>::default(),
        scheduler: 5,
        steps: 12,
        boundary: 6,
        refresh_interval: 4,
        initial_learning_rate: 0.05,
        minimum_learning_rate: 0.001,
        generator: Xoshiro256PlusPlus::seed_from_u64(3).state(),
    }
}

fn record_bytes(record: ResumeRecord<TestBackend>) -> Vec<u8> {
    NamedMpkBytesRecorder::<FullPrecisionSettings>::new()
        .record(record, ())
        .expect("the test record encodes")
}

#[test]
fn model_checkpoint_round_trips_bit_exactly_across_backends() {
    let trained = model(7);
    let mut bytes = Vec::new();
    write_model(trained.clone(), &mut bytes).expect("the model checkpoint writes");

    let reopened = open_model::<NdArray>(bytes.as_slice(), architecture(), &device())
        .expect("the model checkpoint opens on the plain inference backend");

    assert_eq!(
        probe(&trained.valid(), &device()),
        probe(&reopened, &device()),
        "the reopened model should compute the identical function"
    );
}

#[test]
fn open_model_rejects_a_different_width() {
    let mut bytes = Vec::new();
    write_model(model(7), &mut bytes).expect("the model checkpoint writes");

    let mut wider = architecture();
    wider.width = nonzero(16);
    let error = open_model::<NdArray>(bytes.as_slice(), wider, &device())
        .expect_err("a width mismatch should be rejected");
    let CheckpointError::Architecture(mismatch) = error else {
        panic!("the rejection should name the architecture: {error}");
    };
    assert_eq!(mismatch.expected, 16);
    assert_eq!(mismatch.actual, 8);
}

#[test]
fn open_model_rejects_a_different_depth_before_loading() {
    let mut bytes = Vec::new();
    write_model(model(7), &mut bytes).expect("the model checkpoint writes");

    let mut deeper = architecture();
    deeper.residual_blocks = nonzero(3);
    // A depth mismatch panics inside the framework's record zip, so
    // this open returning an error at all certifies the pre-load
    // check.
    let error = open_model::<NdArray>(bytes.as_slice(), deeper, &device())
        .expect_err("a depth mismatch should be rejected");
    let CheckpointError::Architecture(mismatch) = error else {
        panic!("the rejection should name the architecture: {error}");
    };
    assert_eq!(mismatch.layer, Layer::BlockStack);
    assert_eq!(mismatch.dimension, Dimension::Depth);
}

#[test]
fn open_model_rejects_truncated_bytes() {
    let mut bytes = Vec::new();
    write_model(model(7), &mut bytes).expect("the model checkpoint writes");
    // A fixed prefix well inside the record: an incomplete file.
    bytes.truncate(100);

    let error = open_model::<NdArray>(bytes.as_slice(), architecture(), &device())
        .expect_err("truncated bytes should be rejected");
    assert!(
        matches!(error, CheckpointError::Record(_)),
        "the rejection should name the record decode: {error}"
    );
}

#[test]
fn resume_checkpoint_round_trips_the_generator_and_schedule() {
    let bytes = record_bytes(resume_record());
    let (state, generator) =
        open_resume::<TestBackend>(bytes.as_slice(), architecture(), &device())
            .expect("the resume checkpoint opens");

    assert_eq!(
        generator.state(),
        Xoshiro256PlusPlus::seed_from_u64(3).state(),
        "the generator state should round-trip exactly"
    );
    assert_eq!(state.schedule().steps().get(), 12);
    assert_eq!(state.schedule().boundary(), 6);
    assert_eq!(state.schedule().refresh_interval().get(), 4);
}

#[test]
fn open_resume_rejects_an_invalid_schedule() {
    let mut record = resume_record();
    record.minimum_learning_rate = 0.9;
    let bytes = record_bytes(record);

    let Err(error) = open_resume::<TestBackend>(bytes.as_slice(), architecture(), &device()) else {
        panic!("a minimum above the initial rate should be rejected");
    };
    assert!(
        matches!(error, CheckpointError::InvalidSchedule),
        "the rejection should name the schedule: {error}"
    );
}

#[test]
fn open_resume_rejects_a_scheduler_away_from_the_boundary() {
    let mut record = resume_record();
    record.scheduler = 3;
    let bytes = record_bytes(record);

    let Err(error) = open_resume::<TestBackend>(bytes.as_slice(), architecture(), &device()) else {
        panic!("a scheduler position off the boundary should be rejected");
    };
    let CheckpointError::SchedulerPosition { position, boundary } = error else {
        panic!("the rejection should name the position: {error}");
    };
    assert_eq!(position, 3);
    assert_eq!(boundary, 6);
}
