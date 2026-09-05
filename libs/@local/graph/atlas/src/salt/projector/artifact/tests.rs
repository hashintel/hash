//! Certificates for the model checkpoint artifact.
//!
//! Bit-exact round-trips across backends, and every open-path verification naming its failure.
//!
//! Forward-equality assertions are bit-exact by design. The record stores every f32 parameter at
//! full precision, so a round-tripped model must compute the identical function. Any deviation
//! breaks the round-trip rather than merely losing precision.

use std::sync::LazyLock;

use burn::{
    module::AutodiffModule as _,
    tensor::{Int, Tensor, TensorData},
};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{CheckpointError, RecordedModel, open_model};
use crate::{
    device::{Device, Inference, PhysicalDevice, Training},
    math::nz,
    salt::projector::model::{Architecture, Dimension, Layer, Projector, ProjectorInput},
};

fn architecture() -> Architecture {
    Architecture {
        width: nz!(8),
        residual_blocks: nz!(2),
        representation_dimensions: nz!(6),
        role_dimensions: nz!(4),
        condition_dimensions: nz!(1),
    }
}

static DEVICE: LazyLock<PhysicalDevice> = LazyLock::new(|| Device::Cpu.pin(0).resolve());

fn model(seed: u64) -> Projector<Training> {
    Projector::new(
        architecture(),
        &*DEVICE,
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

#[test]
fn model_checkpoint_round_trips_bit_exactly_across_backends() {
    let trained = model(7);
    let bytes = RecordedModel::record(trained.clone())
        .expect("the model checkpoint records")
        .0;

    let reopened = open_model::<Inference>(bytes.as_slice(), architecture(), &*DEVICE)
        .expect("the model checkpoint opens on the plain inference backend");

    assert_eq!(
        probe(&trained.valid(), &*DEVICE),
        probe(&reopened, &*DEVICE),
        "the reopened model should compute the identical function"
    );
}

#[test]
fn open_model_rejects_a_different_width() {
    let bytes = RecordedModel::record(model(7))
        .expect("the model checkpoint records")
        .0;

    let mut wider = architecture();
    wider.width = nz!(16);
    let error = open_model::<Training>(bytes.as_slice(), wider, &*DEVICE)
        .expect_err("a width mismatch should be rejected");
    let CheckpointError::Architecture(mismatch) = error else {
        panic!("the rejection should name the architecture: {error}");
    };
    assert_eq!(mismatch.expected, 16);
    assert_eq!(mismatch.actual, 8);
}

#[test]
fn open_model_rejects_a_different_depth_before_loading() {
    let bytes = RecordedModel::record(model(7))
        .expect("the model checkpoint records")
        .0;

    let mut deeper = architecture();
    deeper.residual_blocks = nz!(3);
    // A depth mismatch panics inside the framework's record zip, so
    // this open returning an error at all certifies the pre-load
    // check.
    let error = open_model::<Training>(bytes.as_slice(), deeper, &*DEVICE)
        .expect_err("a depth mismatch should be rejected");
    let CheckpointError::Architecture(mismatch) = error else {
        panic!("the rejection should name the architecture: {error}");
    };
    assert_eq!(mismatch.layer, Layer::BlockStack);
    assert_eq!(mismatch.dimension, Dimension::Depth);
}

#[test]
fn open_model_rejects_truncated_bytes() {
    let mut bytes = RecordedModel::record(model(7))
        .expect("the model checkpoint records")
        .0;
    // A fixed prefix well inside the record: an incomplete file.
    bytes.truncate(100);

    let error = open_model::<Training>(bytes.as_slice(), architecture(), &*DEVICE)
        .expect_err("truncated bytes should be rejected");
    assert!(
        matches!(error, CheckpointError::Record(_)),
        "the rejection should name the record decode: {error}"
    );
}
