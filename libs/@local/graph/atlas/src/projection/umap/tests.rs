use std::{
    fs::File,
    io::BufReader,
    path::{Path, PathBuf},
};

use npyz::Deserialize;

use super::{
    CurveParameters, ParallelOptimizer, UmapOptions, fit_curve_parameters,
    kernel::{normalize_coordinates, squared_distance, tau_rand_int},
    serial::SerialOptimizer,
};
use crate::projection::graph::SparseGraph;

const FLOAT_TOLERANCE: f32 = 4.0e-5;

fn fixture_path(relative: impl AsRef<Path>) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../tools/embedding2d/oracle/fixtures/v1/optimizer")
        .join(relative)
}

fn read_npy<T: Deserialize>(relative: impl AsRef<Path>) -> (Vec<u64>, Vec<T>) {
    let file = BufReader::new(File::open(fixture_path(relative)).expect("fixture should open"));
    let npy = npyz::NpyFile::new(file).expect("fixture header should parse");
    let shape = npy.shape().to_vec();
    let values = npy.into_vec::<T>().expect("fixture data should parse");
    (shape, values)
}

fn read_graph() -> SparseGraph {
    let (_, indptr) = read_npy::<i64>("graph-indptr.npy");
    let (_, indices) = read_npy::<i64>("graph-indices.npy");
    let (_, values) = read_npy::<f32>("graph-values.npy");
    let rows = indptr.len() - 1;
    SparseGraph::new(
        (rows, rows),
        indptr
            .into_iter()
            .map(|value| u32::try_from(value).expect("pointer should fit u32"))
            .collect(),
        indices
            .into_iter()
            .map(|value| u32::try_from(value).expect("index should fit u32"))
            .collect(),
        values,
    )
}

fn read_layout(name: &str) -> Vec<[f32; 2]> {
    let (shape, values) = read_npy::<f32>(name);
    assert_eq!(shape[1], 2);
    values
        .chunks_exact(2)
        .map(|coordinate| [coordinate[0], coordinate[1]])
        .collect()
}

fn assert_close(context: &str, actual: &[[f32; 2]], expected: &[[f32; 2]]) {
    assert_eq!(actual.len(), expected.len());
    for (row, (actual, expected)) in actual.iter().zip(expected).enumerate() {
        for axis in 0..2 {
            assert!(
                (actual[axis] - expected[axis]).abs() <= FLOAT_TOLERANCE,
                "{context} coordinate ({row}, {axis}) differs: {} != {}",
                actual[axis],
                expected[axis]
            );
        }
    }
}

fn fuzzy_cross_entropy(
    graph: &SparseGraph,
    coordinates: &[[f32; 2]],
    curve: CurveParameters,
) -> f64 {
    let mut loss = 0.0;
    for (row, &left) in coordinates.iter().enumerate() {
        for (column, &right) in coordinates.iter().enumerate() {
            if row == column {
                continue;
            }

            let high_dimensional = graph.get(row, column).copied().unwrap_or(0.0);
            let distance_squared = f64::from(squared_distance(left, right));
            let low_dimensional = (1.0 / (1.0 + curve.a * distance_squared.powf(curve.b)))
                .clamp(1.0e-7, 1.0 - 1.0e-7);
            let high_dimensional = f64::from(high_dimensional);
            loss -= high_dimensional * low_dimensional.ln()
                + (1.0 - high_dimensional) * (-low_dimensional).ln_1p();
        }
    }
    loss
}

#[test]
fn matches_oracle_tau_rng() {
    let mut row_zero = [-538_846_105, 1_273_642_420, 1_935_803_229];
    let actual = core::array::from_fn::<_, 12, _>(|_| tau_rand_int(&mut row_zero));
    assert_eq!(
        actual,
        [
            1_512_524_284,
            -1_869_814_856,
            -86_469_464,
            604_100_009,
            487_691_773,
            903_875_346,
            178_266_504,
            -1_135_562_242,
            1_321_280_848,
            711_812_124,
            -1_148_191_870,
            -51_790_760,
        ]
    );
}

#[test]
fn fits_oracle_curve_parameters() {
    let (_, expected) = read_npy::<f64>("ab.npy");
    let actual = fit_curve_parameters(1.0, 0.1).expect("curve fit should converge");
    assert!((actual.a - expected[0]).abs() < 1.0e-6);
    assert!((actual.b - expected[1]).abs() < 1.0e-6);
}

#[test]
fn parallel_optimizer_safely_splits_row_ranges() {
    const ROWS: usize = 512;
    let mut indptr = Vec::with_capacity(ROWS + 1);
    let mut indices = Vec::with_capacity(ROWS * 2);
    let mut values = Vec::with_capacity(ROWS * 2);
    indptr.push(0_u32);
    for row in 0..ROWS {
        let mut neighbors = [(row + ROWS - 1) % ROWS, (row + 1) % ROWS];
        neighbors.sort_unstable();
        indices.extend(neighbors.map(|neighbor| neighbor as u32));
        values.extend([1.0, 1.0]);
        indptr.push(indices.len() as u32);
    }
    let graph = SparseGraph::new((ROWS, ROWS), indptr, indices, values);
    let initial = (0..ROWS)
        .map(|row| {
            let x = row as f32 / ROWS as f32;
            let y = ((row * 97) % ROWS) as f32 / ROWS as f32;
            [x, y]
        })
        .collect();
    let initial = normalize_coordinates(initial).expect("initial layout should normalize");
    let mut optimizer = ParallelOptimizer::new(
        &graph,
        initial.clone(),
        CurveParameters::new(1.5, 0.9).expect("curve is valid"),
        UmapOptions {
            epochs: 3,
            initial_learning_rate: 1.0,
            repulsion_strength: 1.0,
            negative_sample_rate: 5,
        },
        [17, 29, 101],
    )
    .expect("parallel optimizer should initialize");
    optimizer.run().expect("parallel optimizer should finish");

    let actual = optimizer.coordinates();
    assert_eq!(actual.len(), ROWS);
    assert!(actual.iter().flatten().all(|value| value.is_finite()));
    assert_ne!(actual, initial);
}

#[test]
fn parallel_optimizer_reaches_equivalent_oracle_objective() {
    let graph = read_graph();
    let initial = read_layout("initial-layout.npy");
    let (_, curve) = read_npy::<f64>("ab.npy");
    let curve = CurveParameters::new(curve[0], curve[1]).expect("oracle curve should be valid");
    let (_, random_state) = read_npy::<i64>("rng-state.npy");
    let mut optimizer = ParallelOptimizer::new(
        &graph,
        initial,
        curve,
        UmapOptions {
            epochs: 20,
            initial_learning_rate: 1.0,
            repulsion_strength: 1.0,
            negative_sample_rate: 5,
        },
        [random_state[0], random_state[1], random_state[2]],
    )
    .expect("parallel optimizer inputs should be valid");
    optimizer.run().expect("parallel optimizer should finish");

    let actual = optimizer.coordinates();
    assert!(actual.iter().flatten().all(|value| value.is_finite()));
    let expected = read_layout("final-layout.npy");
    let expected_loss = fuzzy_cross_entropy(&graph, &expected, curve);
    let actual_loss = fuzzy_cross_entropy(&graph, &actual, curve);
    assert!(
        (actual_loss / expected_loss - 1.0).abs() <= 0.01,
        "parallel fuzzy cross entropy differs: {actual_loss} != {expected_loss}"
    );
    assert_eq!(optimizer.epoch(), 20);
    assert!(
        !optimizer
            .step()
            .expect("completed optimizer should be stable")
    );
}

#[test]
fn matches_serial_optimizer_oracle() {
    let graph = read_graph();
    let initial = read_layout("initial-layout.npy");
    let (_, curve) = read_npy::<f64>("ab.npy");
    let (_, random_state) = read_npy::<i64>("rng-state.npy");
    let mut optimizer = SerialOptimizer::new(
        &graph,
        initial,
        CurveParameters::new(curve[0], curve[1]).expect("oracle curve should be valid"),
        UmapOptions {
            epochs: 20,
            initial_learning_rate: 1.0,
            repulsion_strength: 1.0,
            negative_sample_rate: 5,
        },
        [random_state[0], random_state[1], random_state[2]],
    )
    .expect("oracle optimizer inputs should be valid");

    assert_close(
        "normalized initialization",
        optimizer.coordinates(),
        &read_layout("normalized-initial-layout.npy"),
    );
    let (_, expected_epochs_per_sample) = read_npy::<f64>("epochs-per-sample.npy");
    let (_, expected_epochs_per_negative_sample) =
        read_npy::<f64>("epochs-per-negative-sample.npy");
    assert_eq!(optimizer.epochs_per_sample(), expected_epochs_per_sample);
    assert_eq!(
        optimizer.epochs_per_negative_sample(),
        expected_epochs_per_negative_sample
    );

    for (epoch, fixture) in [
        (1, "layout-epoch-001.npy"),
        (2, "layout-epoch-002.npy"),
        (5, "layout-epoch-005.npy"),
    ] {
        while optimizer.epoch() < epoch {
            assert!(optimizer.step().expect("optimizer step should succeed"));
        }
        assert_close(fixture, optimizer.coordinates(), &read_layout(fixture));
    }

    optimizer.run().expect("optimizer should finish");
    assert_eq!(
        optimizer.random_calls(),
        [224, 270, 310, 400, 331, 302, 286, 255]
    );
    assert_eq!(
        optimizer.random_states(),
        [
            [-4_076_687_446, 1_057_967_910, 1_265_017_345],
            [128_929_269, 3_201_897_978, 3_314_308_606],
            [1_983_891_697, 4_180_599_552, 1_561_371_131],
            [2_191_869_116, 861_855_423, 449_749_004],
            [2_992_647_585, 1_453_544_536, 3_811_399_551],
            [190_172_337, 3_325_330_006, 2_536_757_794],
            [673_909_168, 1_467_534_168, 3_643_438_913],
            [2_966_361_626, 3_069_171_811, 706_004_887],
        ]
    );

    // Numba compiles the oracle epoch kernel with `fastmath=True`. The tiny arithmetic
    // differences remain below the raw-coordinate tolerance through epoch five, but are
    // eventually amplified by repulsion between nearly coincident points. At convergence,
    // compare the invariant UMAP objective instead of accepting an uninformative coordinate
    // tolerance wide enough to hide a genuinely different layout.
    let expected = read_layout("final-layout.npy");
    let expected_loss = fuzzy_cross_entropy(&graph, &expected, optimizer.curve());
    let actual_loss = fuzzy_cross_entropy(&graph, optimizer.coordinates(), optimizer.curve());
    assert!(
        (actual_loss / expected_loss - 1.0).abs() <= 0.01,
        "final fuzzy cross entropy differs: {actual_loss} != {expected_loss}"
    );
    assert!(
        !optimizer
            .step()
            .expect("completed optimizer should be stable")
    );
}
