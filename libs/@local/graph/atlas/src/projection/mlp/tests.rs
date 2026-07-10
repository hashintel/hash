use core::num::NonZero;

use burn::{
    backend::{Autodiff, Candle, candle::CandleDevice},
    module::Module as _,
    tensor::{Tensor, TensorData},
};

use super::{FittedProjector, OUTPUT_DIM, Projector, ProjectorError, TrainingConfig};
use crate::float::FloatBytes;

type TestBackend = Candle;
type TestAutodiffBackend = Autodiff<TestBackend>;

const INPUT_DIM: usize = 6;

fn device() -> CandleDevice {
    CandleDevice::Cpu
}

/// A deterministic synthetic regression problem: coordinates are a fixed
/// linear map of the features plus a small nonlinearity, offset and scaled
/// so standardization has something to remove.
fn synthetic_data(rows: usize) -> (FloatBytes, FloatBytes) {
    let mut features = Vec::with_capacity(rows * INPUT_DIM);
    let mut coordinates = Vec::with_capacity(rows * OUTPUT_DIM);

    for row in 0..rows {
        let phase = row as f32 / rows as f32;
        let mut feature = [0.0_f32; INPUT_DIM];
        for (index, value) in feature.iter_mut().enumerate() {
            *value = ((row * 31 + index * 17) % 97) as f32 / 97.0 - 0.5;
        }
        features.extend_from_slice(&feature);

        let x = 40.0 * feature[0] + 10.0 * feature[1] * feature[2] + 25.0;
        let y = 30.0 * feature[3] - 8.0 * feature[4] + 5.0 * (phase * 6.0).sin() - 60.0;
        coordinates.extend_from_slice(&[x, y]);
    }

    (
        FloatBytes::from_vec(features, NonZero::new(INPUT_DIM).unwrap()).unwrap(),
        FloatBytes::from_vec(coordinates, NonZero::new(OUTPUT_DIM).unwrap()).unwrap(),
    )
}

fn quick_config() -> TrainingConfig {
    TrainingConfig {
        batch_size: 64,
        epochs: 8,
        validation_fraction: 0.1,
        num_workers: 1,
        learning_rate: 1e-2,
        learning_rate_min: 1e-3,
        ..TrainingConfig::default()
    }
}

fn fit_synthetic(rows: usize) -> (FittedProjector<TestBackend>, FloatBytes, FloatBytes) {
    let (xs, ys) = synthetic_data(rows);
    let artifacts = tempfile::tempdir().expect("artifact directory should open");
    let fitted = Projector::<TestAutodiffBackend>::new(INPUT_DIM, &device())
        .fit(
            xs.clone(),
            ys.clone(),
            quick_config(),
            artifacts.path(),
            &device(),
        )
        .expect("training should succeed");
    (fitted, xs, ys)
}

fn forward_rows(projector: &Projector<TestBackend>, xs: &FloatBytes) -> Vec<[f32; 2]> {
    let mut values = Vec::with_capacity(xs.len() * xs.dim());
    for row in 0..xs.len() {
        values.extend_from_slice(xs.row(row));
    }
    let input = Tensor::from_data(TensorData::new(values, [xs.len(), xs.dim()]), &device());
    projector
        .forward(input)
        .into_data()
        .to_vec::<f32>()
        .expect("output should convert")
        .chunks_exact(OUTPUT_DIM)
        .map(|pair| [pair[0], pair[1]])
        .collect()
}

fn rmse(predicted: &[[f32; 2]], ys: &FloatBytes) -> f64 {
    let mut sum = 0.0_f64;
    for (row, prediction) in predicted.iter().enumerate() {
        for (axis, &value) in ys.row(row).iter().enumerate() {
            sum += f64::from(prediction[axis] - value).powi(2);
        }
    }
    (sum / (predicted.len() * OUTPUT_DIM) as f64).sqrt()
}

#[test]
fn training_reduces_validation_error_and_returns_layout_units() {
    let (fitted, xs, ys) = fit_synthetic(512);

    // The reported RMSE is in layout units. The synthetic layout spans
    // roughly [-100, 100] per axis, so an untrained encoder sits far above
    // this threshold while a converged one lands well below it.
    assert!(fitted.validation_rmse.is_finite());
    assert!(
        fitted.validation_rmse < 15.0,
        "validation RMSE should approach the layout scale, got {}",
        fitted.validation_rmse
    );

    // The folded encoder produces finite raw-layout coordinates whose full
    // dataset RMSE is consistent with the reported validation RMSE.
    let predictions = forward_rows(&fitted.encoder, &xs);
    assert!(predictions.iter().flatten().all(|value| value.is_finite()));
    let full_rmse = rmse(&predictions, &ys);
    assert!(
        full_rmse < 2.0 * fitted.validation_rmse.max(1.0),
        "folded encoder RMSE {full_rmse} is inconsistent with reported {}",
        fitted.validation_rmse
    );

    // The standardization captured the synthetic offsets.
    assert!((fitted.center[0] - 25.0).abs() < 10.0);
    assert!((fitted.center[1] + 60.0).abs() < 10.0);
    assert!(fitted.scale.iter().all(|&scale| scale > 1.0));
}

#[test]
fn folding_matches_manual_destandardization() {
    let (fitted, xs, _) = fit_synthetic(256);

    let folded = forward_rows(&fitted.encoder, &xs);
    let standardized = forward_rows(&fitted.standardized, &xs);

    for (folded, standardized) in folded.iter().zip(&standardized) {
        for axis in 0..OUTPUT_DIM {
            let expected = standardized[axis] * fitted.scale[axis] + fitted.center[axis];
            assert!(
                (folded[axis] - expected).abs() <= 1e-3 * expected.abs().max(1.0),
                "folded output {} differs from de-standardized {expected}",
                folded[axis]
            );
        }
    }
}

#[test]
fn unfolding_inverts_folding() {
    let (fitted, xs, _) = fit_synthetic(256);

    let unfolded = fitted
        .encoder
        .clone()
        .unfold_output(fitted.center, fitted.scale, &device());
    let original = forward_rows(&fitted.standardized, &xs);
    let round_tripped = forward_rows(&unfolded, &xs);

    for (original, round_tripped) in original.iter().zip(&round_tripped) {
        for axis in 0..OUTPUT_DIM {
            assert!(
                (original[axis] - round_tripped[axis]).abs() <= 1e-4,
                "unfold(fold(model)) drifted: {} != {}",
                original[axis],
                round_tripped[axis]
            );
        }
    }
}

#[test]
fn chained_initialization_preserves_previous_weights() {
    let (fitted, _, _) = fit_synthetic(256);

    // Chaining converts the standardized encoder back to the autodiff
    // backend; its weights must be exactly the fitted ones.
    let chained = fitted.standardized.clone().train::<TestAutodiffBackend>();

    let fitted_record = fitted.standardized.into_record();
    let chained_record = chained.into_record();

    let fitted_weight = fitted_record.l0.weight.val().into_data();
    let chained_weight = chained_record.l0.weight.val().into_data();
    assert_eq!(
        fitted_weight.to_vec::<f32>().unwrap(),
        chained_weight.to_vec::<f32>().unwrap(),
        "chained initialization must start from the previous rung's weights"
    );
}

#[test]
fn rejects_invalid_configurations_and_shapes() {
    let (xs, ys) = synthetic_data(64);
    let artifacts = tempfile::tempdir().expect("artifact directory should open");
    let projector = || Projector::<TestAutodiffBackend>::new(INPUT_DIM, &device());
    let fit = |xs: FloatBytes, ys: FloatBytes, config: TrainingConfig| {
        projector()
            .fit(xs, ys, config, artifacts.path(), &device())
            .map(|_| ())
    };

    assert!(matches!(
        fit(
            xs.clone(),
            ys.clone(),
            TrainingConfig {
                batch_size: 0,
                ..quick_config()
            }
        ),
        Err(ProjectorError::InvalidBatchSize(0))
    ));
    assert!(matches!(
        fit(
            xs.clone(),
            ys.clone(),
            TrainingConfig {
                epochs: 0,
                ..quick_config()
            }
        ),
        Err(ProjectorError::InvalidEpochs(0))
    ));
    assert!(matches!(
        fit(
            xs.clone(),
            ys.clone(),
            TrainingConfig {
                patience: 0,
                ..quick_config()
            }
        ),
        Err(ProjectorError::InvalidPatience(0))
    ));
    assert!(matches!(
        fit(
            xs.clone(),
            ys.clone(),
            TrainingConfig {
                num_workers: 0,
                ..quick_config()
            }
        ),
        Err(ProjectorError::InvalidWorkers(0))
    ));
    assert!(matches!(
        fit(
            xs.clone(),
            ys.clone(),
            TrainingConfig {
                learning_rate: 2.0,
                ..quick_config()
            }
        ),
        Err(ProjectorError::InvalidLearningRate { .. })
    ));
    assert!(matches!(
        fit(
            xs.clone(),
            ys.clone(),
            TrainingConfig {
                learning_rate_min: 0.0,
                ..quick_config()
            }
        ),
        Err(ProjectorError::InvalidLearningRate { .. })
    ));
    assert!(matches!(
        fit(
            xs.clone(),
            ys.clone(),
            TrainingConfig {
                validation_fraction: 0.0,
                ..quick_config()
            }
        ),
        Err(ProjectorError::InvalidValidationSplit { .. })
    ));
    // A fraction that rounds down to zero validation rows is rejected even
    // though it is within (0, 1).
    assert!(matches!(
        fit(
            xs.clone(),
            ys.clone(),
            TrainingConfig {
                validation_fraction: 1e-6,
                ..quick_config()
            }
        ),
        Err(ProjectorError::InvalidValidationSplit { rows: 64, .. })
    ));

    let empty = FloatBytes::from_vec(Vec::new(), NonZero::new(OUTPUT_DIM).unwrap()).unwrap();
    assert!(matches!(
        fit(xs.clone(), empty, quick_config()),
        Err(ProjectorError::EmptyTrainingData)
    ));

    let three_wide = FloatBytes::from_vec(vec![0.0; 64 * 3], NonZero::new(3).unwrap()).unwrap();
    assert!(matches!(
        fit(xs.clone(), three_wide, quick_config()),
        Err(ProjectorError::OutputDimension { actual: 3 })
    ));

    let short = FloatBytes::from_vec(vec![0.0; 32 * 2], NonZero::new(2).unwrap()).unwrap();
    assert!(matches!(
        fit(xs.clone(), short, quick_config()),
        Err(ProjectorError::RowCount {
            features: 64,
            coordinates: 32
        })
    ));

    let mut bad_values = vec![0.5; 64 * 2];
    bad_values[3] = f32::NAN;
    let non_finite = FloatBytes::from_vec(bad_values, NonZero::new(2).unwrap()).unwrap();
    assert!(matches!(
        fit(xs.clone(), non_finite, quick_config()),
        Err(ProjectorError::NonFiniteCoordinate {
            row: 1,
            axis: 1,
            ..
        })
    ));

    let narrow = FloatBytes::from_vec(vec![0.0; 64 * 3], NonZero::new(3).unwrap()).unwrap();
    assert!(matches!(
        fit(narrow, ys, quick_config()),
        Err(ProjectorError::InputDimension {
            expected: INPUT_DIM,
            actual: 3
        })
    ));
}
