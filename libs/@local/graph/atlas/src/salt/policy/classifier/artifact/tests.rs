#![expect(
    clippy::little_endian_bytes,
    reason = "the tamper patches pin the format's canonical little-endian bytes"
)]

use std::{fs, path::PathBuf};

use super::InvalidClassifierFile;
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    file::{
        WriteInto as _,
        classifier::{FileHeader, read::ClassifierFile, write::write_regions},
    },
    math::{BoxedDVecN, BoxedVecN},
    salt::policy::{
        GeometryClass,
        classifier::{Applicability, Classifier},
    },
};

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-classifier-artifact-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

/// Fills a vector with an exactly representable component pattern.
///
/// Phase-shifted by `offset` so distinct vectors stay distinct.
fn filled(offset: usize) -> BoxedDVecN<CANONICAL_DIMENSIONS> {
    const PATTERN: [f64; 16] = [
        -1.0, -0.875, -0.75, -0.625, -0.5, -0.375, -0.25, -0.125, 0.0, 0.125, 0.25, 0.375, 0.5,
        0.625, 0.75, 0.875,
    ];

    let mut vector = BoxedDVecN::zero();
    for (component, &value) in vector
        .as_array_mut()
        .iter_mut()
        .zip(PATTERN.iter().cycle().skip(offset))
    {
        *component = value;
    }
    vector
}

/// A hand-built model with every parameter kind nonzero and distinct.
///
/// The training distances include a tie, pinning that the ascending order the artifact validates is
/// non-strict.
fn fixture() -> Classifier {
    const SCALES: [f64; 4] = [1.0, 1.25, 1.5, 1.75];

    let mut inverse_scales = BoxedDVecN::zero();
    for (component, &value) in inverse_scales
        .as_array_mut()
        .iter_mut()
        .zip(SCALES.iter().cycle())
    {
        *component = value;
    }

    Classifier {
        coefficients: [filled(0), filled(5), filled(11)],
        intercepts: [0.25, -0.5, 0.125],
        temperature: 1.5,
        applicability: Applicability {
            mean: filled(3),
            inverse_scales,
            distances: Box::new([0.0, 0.5, 0.5, 1.25, 2.5]),
        },
    }
}

/// The fixture's header: the offset equations for tamper patches.
fn fixture_header() -> FileHeader {
    FileHeader::new(CANONICAL_DIMENSIONS as u64, 5, 1.5, [0.25, -0.5, 0.125])
}

fn fixture_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    fixture()
        .write_into(&mut bytes)
        .expect("writing into a vector cannot fail");
    bytes
}

/// Opens tampered fixture bytes and reads the model out of them.
fn reopen(name: &str, bytes: &[u8]) -> Result<Classifier, InvalidClassifierFile> {
    let path = scratch(name);
    fs::write(&path, bytes).expect("the scratch file is writable");
    let file = ClassifierFile::open(&path).expect("the tampered geometry still parses");
    Classifier::from_artifact(&file)
}

#[test]
fn round_trip_is_bit_exact() {
    let original = fixture();
    let reopened = reopen("roundtrip.clsf", &fixture_bytes()).expect("the fixture is valid");

    assert_eq!(reopened, original);
}

#[test]
fn mapped_and_fitted_predictions_agree() {
    const PATTERN: [f32; 8] = [-1.0, -0.25, 0.5, -0.75, 0.0, 0.75, -0.5, 0.25];

    let mut embedding = BoxedVecN::<CANONICAL_DIMENSIONS>::zero();
    for (component, &value) in embedding
        .as_array_mut()
        .iter_mut()
        .zip(PATTERN.iter().cycle())
    {
        *component = value;
    }

    let original = fixture();
    let reopened = reopen("parity.clsf", &fixture_bytes()).expect("the fixture is valid");

    let expected = original.predict(&embedding).expect("the fixture predicts");
    let actual = reopened
        .predict(&embedding)
        .expect("the reopened model predicts");
    assert_eq!(actual, expected);
}

#[test]
fn rejects_foreign_dimension() {
    let path = scratch("dimension.clsf");
    let row = [0.5; 4];
    let mut bytes = Vec::new();
    write_regions(
        1.0,
        [0.0; 3],
        [&row, &row, &row],
        &[0.0; 4],
        &[1.0; 4],
        &[0.0, 1.0],
        &mut bytes,
    )
    .expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = ClassifierFile::open(&path).expect("the small file parses");
    assert_eq!(
        Classifier::from_artifact(&file),
        Err(InvalidClassifierFile::Dimension { dimension: 4 }),
    );
}

#[test]
fn rejects_tampered_scalars() {
    // Temperature at header offset 32.
    let mut bytes = fixture_bytes();
    bytes[32..40].copy_from_slice(&(-1.0_f64).to_le_bytes());
    assert_eq!(
        reopen("temperature.clsf", &bytes),
        Err(InvalidClassifierFile::Temperature { value: -1.0 }),
    );

    // The class-1 intercept at header offset 48.
    let mut bytes = fixture_bytes();
    bytes[48..56].copy_from_slice(&f64::INFINITY.to_le_bytes());
    assert_eq!(
        reopen("intercept.clsf", &bytes),
        Err(InvalidClassifierFile::NonFiniteIntercept {
            class: GeometryClass::Proximal,
        }),
    );
}

#[test]
fn rejects_tampered_vectors() {
    let nan = f64::NAN.to_le_bytes();

    // Component 7 of the class-1 coefficient row.
    let offset = FileHeader::SIZE + (CANONICAL_DIMENSIONS + 7) * size_of::<f64>();
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&nan);
    assert_eq!(
        reopen("coefficient.clsf", &bytes),
        Err(InvalidClassifierFile::NonFiniteCoefficient {
            class: GeometryClass::Proximal,
            component: 7,
        }),
    );

    // Component 2 of the mean.
    let offset = usize::try_from(fixture_header().mean_offset().expect("the geometry fits"))
        .expect("the offset fits")
        + 2 * size_of::<f64>();
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&nan);
    assert_eq!(
        reopen("mean.clsf", &bytes),
        Err(InvalidClassifierFile::NonFiniteMean { component: 2 }),
    );

    // Component 3 of the inverse scales, zeroed.
    let offset = usize::try_from(
        fixture_header()
            .inverse_scales_offset()
            .expect("the geometry fits"),
    )
    .expect("the offset fits")
        + 3 * size_of::<f64>();
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&0.0_f64.to_le_bytes());
    assert_eq!(
        reopen("inverse-scale.clsf", &bytes),
        Err(InvalidClassifierFile::InverseScale {
            component: 3,
            value: 0.0,
        }),
    );
}

#[test]
fn rejects_tampered_distances() {
    let distances_offset = usize::try_from(
        fixture_header()
            .distances_offset()
            .expect("the geometry fits"),
    )
    .expect("the offset fits");

    // Distance 3 lowered below its tied predecessors.
    let offset = distances_offset + 3 * size_of::<f64>();
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&0.25_f64.to_le_bytes());
    assert_eq!(
        reopen("unordered.clsf", &bytes),
        Err(InvalidClassifierFile::UnorderedDistances { index: 3 }),
    );

    // Distance 0 made negative.
    let mut bytes = fixture_bytes();
    bytes[distances_offset..distances_offset + 8].copy_from_slice(&(-0.5_f64).to_le_bytes());
    assert_eq!(
        reopen("negative.clsf", &bytes),
        Err(InvalidClassifierFile::Distance {
            index: 0,
            value: -0.5,
        }),
    );

    // Distance count zeroed and the region truncated away: the
    // geometry stays consistent, the domain rejects it.
    let mut bytes = fixture_bytes();
    bytes[24..32].copy_from_slice(&0_u64.to_le_bytes());
    bytes.truncate(distances_offset);
    assert_eq!(
        reopen("empty.clsf", &bytes),
        Err(InvalidClassifierFile::EmptyDistances),
    );
}
