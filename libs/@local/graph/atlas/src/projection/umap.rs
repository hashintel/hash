use core::{
    error::Error,
    fmt,
    sync::atomic::{AtomicU32, Ordering},
};

use levenberg_marquardt::{LeastSquaresProblem, LevenbergMarquardt};
use nalgebra::{Dyn, OMatrix, U2, Vector2, storage::Owned};

use super::graph::{GraphError, SparseGraph};

const CURVE_SAMPLES: usize = 300;
const DEFAULT_SMALL_GRAPH_EPOCHS: usize = 500;
const DEFAULT_LARGE_GRAPH_EPOCHS: usize = 200;
const SMALL_GRAPH_ROWS: usize = 10_000;

#[derive(Debug)]
pub(crate) enum UmapError {
    Graph(GraphError),
    InvalidSpread(f64),
    InvalidMinDistance { min_distance: f64, spread: f64 },
    CurveFitFailed,
    InvalidCurve { a: f64, b: f64 },
    InvalidEpochs(usize),
    InvalidLearningRate(f64),
    InvalidRepulsion(f64),
    InvalidNegativeSampleRate(usize),
    EmptyGraph,
    NonSquareGraph { rows: usize, columns: usize },
    LayoutLength { rows: usize, coordinates: usize },
    NonFiniteCoordinate { row: usize, axis: usize, value: f32 },
    DegenerateCoordinateAxis(usize),
    InvalidGraphWeight { offset: usize, weight: f32 },
    TooManyVertices(usize),
}

impl fmt::Display for UmapError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Graph(error) => error.fmt(formatter),
            Self::InvalidSpread(spread) => {
                write!(
                    formatter,
                    "UMAP spread must be finite and positive, got {spread}"
                )
            }
            Self::InvalidMinDistance {
                min_distance,
                spread,
            } => write!(
                formatter,
                "UMAP minimum distance must be finite and within [0, spread]; got {min_distance} \
                 with spread {spread}"
            ),
            Self::CurveFitFailed => formatter.write_str("UMAP a/b curve fitting did not converge"),
            Self::InvalidCurve { a, b } => {
                write!(
                    formatter,
                    "UMAP curve parameters must be finite and positive, got a={a}, b={b}"
                )
            }
            Self::InvalidEpochs(epochs) => {
                write!(formatter, "UMAP epoch count must be positive, got {epochs}")
            }
            Self::InvalidLearningRate(rate) => {
                write!(
                    formatter,
                    "UMAP learning rate must be finite and positive, got {rate}"
                )
            }
            Self::InvalidRepulsion(repulsion) => write!(
                formatter,
                "UMAP repulsion strength must be finite and non-negative, got {repulsion}"
            ),
            Self::InvalidNegativeSampleRate(rate) => {
                write!(
                    formatter,
                    "UMAP negative sample rate must be positive, got {rate}"
                )
            }
            Self::EmptyGraph => formatter.write_str("cannot optimize an empty UMAP graph"),
            Self::NonSquareGraph { rows, columns } => {
                write!(
                    formatter,
                    "UMAP graph must be square, got {rows} by {columns}"
                )
            }
            Self::LayoutLength { rows, coordinates } => write!(
                formatter,
                "UMAP graph has {rows} rows but the initial layout has {coordinates} coordinates"
            ),
            Self::NonFiniteCoordinate { row, axis, value } => write!(
                formatter,
                "initial UMAP coordinate at row {row}, axis {axis} is non-finite: {value}"
            ),
            Self::DegenerateCoordinateAxis(axis) => write!(
                formatter,
                "initial UMAP coordinates have no range on axis {axis}"
            ),
            Self::InvalidGraphWeight { offset, weight } => write!(
                formatter,
                "UMAP graph weight at storage offset {offset} is not finite and positive: {weight}"
            ),
            Self::TooManyVertices(vertices) => write!(
                formatter,
                "{vertices} UMAP vertices cannot be represented by the reference optimizer"
            ),
        }
    }
}

impl Error for UmapError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Graph(error) => Some(error),
            Self::InvalidSpread(_)
            | Self::InvalidMinDistance { .. }
            | Self::CurveFitFailed
            | Self::InvalidCurve { .. }
            | Self::InvalidEpochs(_)
            | Self::InvalidLearningRate(_)
            | Self::InvalidRepulsion(_)
            | Self::InvalidNegativeSampleRate(_)
            | Self::EmptyGraph
            | Self::NonSquareGraph { .. }
            | Self::LayoutLength { .. }
            | Self::NonFiniteCoordinate { .. }
            | Self::DegenerateCoordinateAxis(_)
            | Self::InvalidGraphWeight { .. }
            | Self::TooManyVertices(_) => None,
        }
    }
}

impl From<GraphError> for UmapError {
    fn from(error: GraphError) -> Self {
        Self::Graph(error)
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct CurveParameters {
    a: f64,
    b: f64,
}

impl CurveParameters {
    fn new(a: f64, b: f64) -> Result<Self, UmapError> {
        if !a.is_finite() || a <= 0.0 || !b.is_finite() || b <= 0.0 {
            return Err(UmapError::InvalidCurve { a, b });
        }
        Ok(Self { a, b })
    }
}

pub(crate) fn fit_curve_parameters(
    spread: f64,
    min_distance: f64,
) -> Result<CurveParameters, UmapError> {
    if !spread.is_finite() || spread <= 0.0 {
        return Err(UmapError::InvalidSpread(spread));
    }
    if !min_distance.is_finite() || min_distance < 0.0 || min_distance > spread {
        return Err(UmapError::InvalidMinDistance {
            min_distance,
            spread,
        });
    }

    let denominator = (CURVE_SAMPLES - 1) as f64;
    let mut x = Vec::with_capacity(CURVE_SAMPLES);
    let mut y = Vec::with_capacity(CURVE_SAMPLES);
    for index in 0..CURVE_SAMPLES {
        let distance = spread * 3.0 * index as f64 / denominator;
        let target = if distance < min_distance {
            1.0
        } else {
            (-(distance - min_distance) / spread).exp()
        };
        x.push(distance);
        y.push(target);
    }

    let problem = CurveFitProblem {
        parameters: Vector2::new(1.0, 1.0),
        x,
        y,
    };
    let (problem, report) = LevenbergMarquardt::new().minimize(problem);
    if !report.termination.was_successful() {
        return Err(UmapError::CurveFitFailed);
    }

    CurveParameters::new(problem.parameters.x, problem.parameters.y)
}

struct CurveFitProblem {
    parameters: Vector2<f64>,
    x: Vec<f64>,
    y: Vec<f64>,
}

impl LeastSquaresProblem<f64, Dyn, U2> for CurveFitProblem {
    type JacobianStorage = Owned<f64, Dyn, U2>;
    type ParameterStorage = Owned<f64, U2>;
    type ResidualStorage = Owned<f64, Dyn>;

    fn set_params(&mut self, parameters: &Vector2<f64>) {
        self.parameters = *parameters;
    }

    fn params(&self) -> Vector2<f64> {
        self.parameters
    }

    fn residuals(&self) -> Option<nalgebra::DVector<f64>> {
        let a = self.parameters.x;
        let b = self.parameters.y;
        if !a.is_finite() || !b.is_finite() {
            return None;
        }

        let residuals = nalgebra::DVector::from_iterator(
            self.x.len(),
            self.x.iter().zip(&self.y).map(|(&x, &target)| {
                let curve = 1.0 / (1.0 + a * x.powf(2.0 * b));
                curve - target
            }),
        );
        residuals
            .iter()
            .all(|value| value.is_finite())
            .then_some(residuals)
    }

    fn jacobian(&self) -> Option<OMatrix<f64, Dyn, U2>> {
        let a = self.parameters.x;
        let b = self.parameters.y;
        let mut jacobian = OMatrix::<f64, Dyn, U2>::zeros_generic(Dyn(self.x.len()), U2);

        for (row, &x) in self.x.iter().enumerate() {
            if x == 0.0 {
                continue;
            }
            let power = x.powf(2.0 * b);
            let denominator = (1.0 + a * power).powi(2);
            jacobian[(row, 0)] = -power / denominator;
            jacobian[(row, 1)] = -(2.0 * a * power * x.ln()) / denominator;
        }

        jacobian
            .iter()
            .all(|value| value.is_finite())
            .then_some(jacobian)
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct SerialUmapOptions {
    pub(crate) epochs: usize,
    pub(crate) initial_learning_rate: f64,
    pub(crate) repulsion_strength: f64,
    pub(crate) negative_sample_rate: usize,
}

impl SerialUmapOptions {
    fn validate(self) -> Result<Self, UmapError> {
        if self.epochs == 0 {
            return Err(UmapError::InvalidEpochs(self.epochs));
        }
        if !self.initial_learning_rate.is_finite() || self.initial_learning_rate <= 0.0 {
            return Err(UmapError::InvalidLearningRate(self.initial_learning_rate));
        }
        if !self.repulsion_strength.is_finite() || self.repulsion_strength < 0.0 {
            return Err(UmapError::InvalidRepulsion(self.repulsion_strength));
        }
        if self.negative_sample_rate == 0 {
            return Err(UmapError::InvalidNegativeSampleRate(
                self.negative_sample_rate,
            ));
        }
        Ok(self)
    }
}

pub(crate) struct SerialOptimizer {
    coordinates: Vec<[f32; 2]>,
    head: Vec<u32>,
    tail: Vec<u32>,
    epochs_per_sample: Vec<f64>,
    epochs_per_negative_sample: Vec<f64>,
    epoch_of_next_sample: Vec<f64>,
    epoch_of_next_negative_sample: Vec<f64>,
    random_states: Vec<[i64; 3]>,
    #[cfg(test)]
    random_calls: Vec<u32>,
    curve: CurveParameters,
    options: SerialUmapOptions,
    epoch: usize,
    learning_rate: f64,
}

impl SerialOptimizer {
    pub(crate) fn new(
        graph: &SparseGraph,
        initial_coordinates: Vec<[f32; 2]>,
        curve: CurveParameters,
        options: SerialUmapOptions,
        random_state: [i64; 3],
    ) -> Result<Self, UmapError> {
        let options = options.validate()?;
        CurveParameters::new(curve.a, curve.b)?;
        if graph.rows() != graph.cols() {
            return Err(UmapError::NonSquareGraph {
                rows: graph.rows(),
                columns: graph.cols(),
            });
        }
        if graph.rows() != initial_coordinates.len() {
            return Err(UmapError::LayoutLength {
                rows: graph.rows(),
                coordinates: initial_coordinates.len(),
            });
        }
        if graph.rows() > u32::MAX as usize {
            return Err(UmapError::TooManyVertices(graph.rows()));
        }

        let coordinates = normalize_coordinates(initial_coordinates)?;
        let (head, tail, weights) = optimizer_edges(graph, options.epochs)?;
        let epochs_per_sample = make_epochs_per_sample(&weights, options.epochs)?;
        let negative_sample_rate = options.negative_sample_rate as f64;
        let epochs_per_negative_sample = epochs_per_sample
            .iter()
            .map(|epochs| epochs / negative_sample_rate)
            .collect::<Vec<_>>();
        let epoch_of_next_sample = epochs_per_sample.clone();
        let epoch_of_next_negative_sample = epochs_per_negative_sample.clone();

        let random_states = coordinates
            .iter()
            .map(|coordinate| {
                let offset = (coordinate[0] as f64).to_bits() as i64;
                random_state.map(|state| state.wrapping_add(offset))
            })
            .collect();

        Ok(Self {
            coordinates,
            head,
            tail,
            epochs_per_sample,
            epochs_per_negative_sample,
            epoch_of_next_sample,
            epoch_of_next_negative_sample,
            random_states,
            #[cfg(test)]
            random_calls: vec![0; graph.rows()],
            curve,
            options,
            epoch: 0,
            learning_rate: options.initial_learning_rate,
        })
    }

    pub(crate) fn coordinates(&self) -> &[[f32; 2]] {
        &self.coordinates
    }

    pub(crate) const fn epoch(&self) -> usize {
        self.epoch
    }

    #[expect(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        reason = "the serial reference intentionally matches umap-learn's f64 schedules and f32 \
                  coordinates"
    )]
    pub(crate) fn step(&mut self) -> Result<bool, UmapError> {
        if self.epoch >= self.options.epochs {
            return Ok(false);
        }

        let epoch = self.epoch as f64;
        for edge in 0..self.epochs_per_sample.len() {
            if self.epoch_of_next_sample[edge] > epoch {
                continue;
            }

            let head = self.head[edge] as usize;
            let tail = self.tail[edge] as usize;
            let distance_squared;
            {
                let (current, other) = pair_mut(&mut self.coordinates, head, tail);
                distance_squared = squared_distance(*current, *other);
                let gradient_coefficient =
                    attractive_gradient_coefficient(distance_squared, self.curve);
                for axis in 0..2 {
                    let difference = f64::from(current[axis] - other[axis]);
                    let gradient = clip(gradient_coefficient * difference);
                    current[axis] =
                        (f64::from(current[axis]) + gradient * self.learning_rate) as f32;
                    other[axis] = (f64::from(other[axis]) - gradient * self.learning_rate) as f32;
                }
            }

            self.epoch_of_next_sample[edge] += self.epochs_per_sample[edge];
            let negative_samples = ((epoch - self.epoch_of_next_negative_sample[edge])
                / self.epochs_per_negative_sample[edge]) as i64;

            for _ in 0..negative_samples.max(0) {
                let random = tau_rand_int(&mut self.random_states[head]);
                #[cfg(test)]
                {
                    self.random_calls[head] += 1;
                }
                let vertex =
                    i64::from(random).rem_euclid(i64::from(self.coordinates.len() as u32)) as u32;
                let vertex = vertex as usize;
                if vertex == head {
                    continue;
                }

                let other = self.coordinates[vertex];
                let current = &mut self.coordinates[head];
                let distance_squared = squared_distance(*current, other);
                let gradient_coefficient = repulsive_gradient_coefficient(
                    distance_squared,
                    self.curve,
                    self.options.repulsion_strength,
                );
                for axis in 0..2 {
                    let difference = f64::from(current[axis] - other[axis]);
                    let gradient = if gradient_coefficient > 0.0 {
                        clip(gradient_coefficient * difference)
                    } else {
                        0.0
                    };
                    current[axis] =
                        (f64::from(current[axis]) + gradient * self.learning_rate) as f32;
                }
            }

            self.epoch_of_next_negative_sample[edge] +=
                negative_samples as f64 * self.epochs_per_negative_sample[edge];
        }

        self.learning_rate = self.options.initial_learning_rate
            * (1.0 - self.epoch as f64 / self.options.epochs as f64);
        self.epoch += 1;
        Ok(true)
    }

    pub(crate) fn run(&mut self) -> Result<(), UmapError> {
        while self.step()? {}
        Ok(())
    }
}

struct ParallelEdge {
    tail: u32,
    epochs_per_sample: f32,
    epochs_per_negative_sample: f32,
    epoch_of_next_sample: f32,
    epoch_of_next_negative_sample: f32,
}

pub(crate) struct ParallelOptimizer {
    coordinates: Vec<[AtomicU32; 2]>,
    row_offsets: Vec<u32>,
    edges: Vec<ParallelEdge>,
    random_states: Vec<[i64; 3]>,
    curve: CurveParameters,
    options: SerialUmapOptions,
    epoch: usize,
    learning_rate: f64,
}

impl ParallelOptimizer {
    pub(crate) fn new(
        graph: &SparseGraph,
        initial_coordinates: Vec<[f32; 2]>,
        curve: CurveParameters,
        options: SerialUmapOptions,
        random_state: [i64; 3],
    ) -> Result<Self, UmapError> {
        let options = options.validate()?;
        CurveParameters::new(curve.a, curve.b)?;
        if graph.rows() != graph.cols() {
            return Err(UmapError::NonSquareGraph {
                rows: graph.rows(),
                columns: graph.cols(),
            });
        }
        if graph.rows() != initial_coordinates.len() {
            return Err(UmapError::LayoutLength {
                rows: graph.rows(),
                coordinates: initial_coordinates.len(),
            });
        }
        if graph.rows() > u32::MAX as usize {
            return Err(UmapError::TooManyVertices(graph.rows()));
        }

        let coordinates = normalize_coordinates(initial_coordinates)?;
        let (row_offsets, tails, weights) = parallel_optimizer_edges(graph, options.epochs)?;
        let epochs_per_sample = make_epochs_per_sample_f32(&weights, options.epochs)?;
        let negative_sample_rate = options.negative_sample_rate as f32;
        let edges = tails
            .into_iter()
            .zip(epochs_per_sample)
            .map(|(tail, epochs_per_sample)| {
                let epochs_per_negative_sample = epochs_per_sample / negative_sample_rate;
                ParallelEdge {
                    tail,
                    epochs_per_sample,
                    epochs_per_negative_sample,
                    epoch_of_next_sample: epochs_per_sample,
                    epoch_of_next_negative_sample: epochs_per_negative_sample,
                }
            })
            .collect();
        let random_states = coordinates
            .iter()
            .map(|coordinate| {
                let offset = (coordinate[0] as f64).to_bits() as i64;
                random_state.map(|state| state.wrapping_add(offset))
            })
            .collect();
        let coordinates = coordinates
            .into_iter()
            .map(|[x, y]| [AtomicU32::new(x.to_bits()), AtomicU32::new(y.to_bits())])
            .collect();

        Ok(Self {
            coordinates,
            row_offsets,
            edges,
            random_states,
            curve,
            options,
            epoch: 0,
            learning_rate: options.initial_learning_rate,
        })
    }

    pub(crate) fn coordinates(&self) -> Vec<[f32; 2]> {
        self.coordinates.iter().map(load_coordinate).collect()
    }

    pub(crate) const fn epoch(&self) -> usize {
        self.epoch
    }

    #[expect(
        clippy::cast_precision_loss,
        reason = "the production schedule uses f32 because epoch counts and graph weights are f32"
    )]
    pub(crate) fn step(&mut self) -> Result<bool, UmapError> {
        if self.epoch >= self.options.epochs {
            return Ok(false);
        }

        optimize_rows(
            0,
            &self.row_offsets,
            &mut self.random_states,
            &mut self.edges,
            &self.coordinates,
            self.epoch as f32,
            self.learning_rate,
            self.curve,
            self.options.repulsion_strength,
        );

        self.learning_rate = self.options.initial_learning_rate
            * (1.0 - self.epoch as f64 / self.options.epochs as f64);
        self.epoch += 1;
        Ok(true)
    }

    pub(crate) fn run(&mut self) -> Result<(), UmapError> {
        while self.step()? {}
        Ok(())
    }
}

#[allow(clippy::too_many_arguments)]
fn optimize_rows(
    head_start: usize,
    row_offsets: &[u32],
    random_states: &mut [[i64; 3]],
    edges: &mut [ParallelEdge],
    coordinates: &[[AtomicU32; 2]],
    epoch: f32,
    learning_rate: f64,
    curve: CurveParameters,
    repulsion_strength: f64,
) {
    const SEQUENTIAL_ROWS: usize = 256;

    if random_states.len() > SEQUENTIAL_ROWS {
        let middle_row = random_states.len() / 2;
        let middle_edge = (row_offsets[middle_row] - row_offsets[0]) as usize;
        let (left_states, right_states) = random_states.split_at_mut(middle_row);
        let (left_edges, right_edges) = edges.split_at_mut(middle_edge);
        let left_offsets = &row_offsets[..=middle_row];
        let right_offsets = &row_offsets[middle_row..];

        rayon::join(
            || {
                optimize_rows(
                    head_start,
                    left_offsets,
                    left_states,
                    left_edges,
                    coordinates,
                    epoch,
                    learning_rate,
                    curve,
                    repulsion_strength,
                );
            },
            || {
                optimize_rows(
                    head_start + middle_row,
                    right_offsets,
                    right_states,
                    right_edges,
                    coordinates,
                    epoch,
                    learning_rate,
                    curve,
                    repulsion_strength,
                );
            },
        );
        return;
    }

    let edge_base = row_offsets[0];
    let vertices = coordinates.len() as u32;
    for (local_head, random_state) in random_states.iter_mut().enumerate() {
        let head = head_start + local_head;
        let start = (row_offsets[local_head] - edge_base) as usize;
        let stop = (row_offsets[local_head + 1] - edge_base) as usize;

        for edge in &mut edges[start..stop] {
            if edge.epoch_of_next_sample > epoch {
                continue;
            }

            let tail = edge.tail as usize;
            let current = load_coordinate(&coordinates[head]);
            let other = load_coordinate(&coordinates[tail]);
            let distance_squared = squared_distance(current, other);
            let coefficient = attractive_gradient_coefficient(distance_squared, curve);
            for axis in 0..2 {
                let difference = f64::from(current[axis] - other[axis]);
                let gradient = clip(coefficient * difference) * learning_rate;
                atomic_add(&coordinates[head][axis], gradient);
                atomic_add(&coordinates[tail][axis], -gradient);
            }

            edge.epoch_of_next_sample += edge.epochs_per_sample;
            let negative_samples = ((epoch - edge.epoch_of_next_negative_sample)
                / edge.epochs_per_negative_sample) as i32;
            for _ in 0..negative_samples.max(0) {
                let random = tau_rand_int(random_state);
                let vertex = i64::from(random).rem_euclid(i64::from(vertices)) as u32;
                let vertex = vertex as usize;
                if vertex == head {
                    continue;
                }

                let current = load_coordinate(&coordinates[head]);
                let other = load_coordinate(&coordinates[vertex]);
                let distance_squared = squared_distance(current, other);
                let coefficient =
                    repulsive_gradient_coefficient(distance_squared, curve, repulsion_strength);
                if coefficient > 0.0 {
                    for axis in 0..2 {
                        let difference = f64::from(current[axis] - other[axis]);
                        let gradient = clip(coefficient * difference) * learning_rate;
                        atomic_add(&coordinates[head][axis], gradient);
                    }
                }
            }
            edge.epoch_of_next_negative_sample +=
                negative_samples as f32 * edge.epochs_per_negative_sample;
        }
    }
}

fn load_coordinate(coordinate: &[AtomicU32; 2]) -> [f32; 2] {
    [
        f32::from_bits(coordinate[0].load(Ordering::Relaxed)),
        f32::from_bits(coordinate[1].load(Ordering::Relaxed)),
    ]
}

fn atomic_add(coordinate: &AtomicU32, difference: f64) {
    let mut current = coordinate.load(Ordering::Relaxed);
    loop {
        let updated = (f64::from(f32::from_bits(current)) + difference) as f32;
        match coordinate.compare_exchange_weak(
            current,
            updated.to_bits(),
            Ordering::Relaxed,
            Ordering::Relaxed,
        ) {
            Ok(_) => break,
            Err(actual) => current = actual,
        }
    }
}

fn parallel_optimizer_edges(
    graph: &SparseGraph,
    epochs: usize,
) -> Result<(Vec<u32>, Vec<u32>, Vec<f32>), UmapError> {
    let maximum = graph
        .data()
        .iter()
        .copied()
        .reduce(f32::max)
        .ok_or(UmapError::EmptyGraph)?;
    if !maximum.is_finite() || maximum <= 0.0 {
        return Err(UmapError::EmptyGraph);
    }

    let default_epochs = if graph.rows() <= SMALL_GRAPH_ROWS {
        DEFAULT_SMALL_GRAPH_EPOCHS
    } else {
        DEFAULT_LARGE_GRAPH_EPOCHS
    };
    let threshold_epochs = if epochs > 10 { epochs } else { default_epochs };
    let threshold = maximum / threshold_epochs as f32;
    let mut row_offsets = Vec::with_capacity(graph.rows() + 1);
    let mut tails = Vec::with_capacity(graph.nnz());
    let mut weights = Vec::with_capacity(graph.nnz());
    row_offsets.push(0);

    for (row, vector) in graph.outer_iterator().enumerate() {
        for (column, &weight) in vector.iter() {
            if !weight.is_finite() || weight <= 0.0 {
                return Err(UmapError::InvalidGraphWeight {
                    offset: weights.len(),
                    weight,
                });
            }
            if row != column && weight >= threshold {
                tails.push(column as u32);
                weights.push(weight);
            }
        }
        row_offsets.push(
            u32::try_from(tails.len())
                .map_err(|_error| UmapError::Graph(GraphError::TooManyEdges(tails.len())))?,
        );
    }

    if weights.is_empty() {
        return Err(UmapError::EmptyGraph);
    }
    Ok((row_offsets, tails, weights))
}

fn optimizer_edges(
    graph: &SparseGraph,
    epochs: usize,
) -> Result<(Vec<u32>, Vec<u32>, Vec<f32>), UmapError> {
    let maximum = graph
        .data()
        .iter()
        .copied()
        .reduce(f32::max)
        .ok_or(UmapError::EmptyGraph)?;
    if !maximum.is_finite() || maximum <= 0.0 {
        return Err(UmapError::EmptyGraph);
    }

    let default_epochs = if graph.rows() <= SMALL_GRAPH_ROWS {
        DEFAULT_SMALL_GRAPH_EPOCHS
    } else {
        DEFAULT_LARGE_GRAPH_EPOCHS
    };
    let threshold_epochs = if epochs > 10 { epochs } else { default_epochs };
    let threshold = maximum / threshold_epochs as f32;
    let mut head = Vec::with_capacity(graph.nnz());
    let mut tail = Vec::with_capacity(graph.nnz());
    let mut weights = Vec::with_capacity(graph.nnz());

    for (row, vector) in graph.outer_iterator().enumerate() {
        for (column, &weight) in vector.iter() {
            if !weight.is_finite() || weight <= 0.0 {
                return Err(UmapError::InvalidGraphWeight {
                    offset: weights.len(),
                    weight,
                });
            }
            if row != column && weight >= threshold {
                head.push(row as u32);
                tail.push(column as u32);
                weights.push(weight);
            }
        }
    }

    if weights.is_empty() {
        return Err(UmapError::EmptyGraph);
    }
    Ok((head, tail, weights))
}

#[expect(
    clippy::cast_precision_loss,
    reason = "umap-learn computes sample counts in f32 before producing an f64 schedule"
)]
fn make_epochs_per_sample(weights: &[f32], epochs: usize) -> Result<Vec<f64>, UmapError> {
    let maximum = weights
        .iter()
        .copied()
        .reduce(f32::max)
        .ok_or(UmapError::EmptyGraph)?;
    let epochs_f32 = epochs as f32;
    let epochs_f64 = epochs as f64;
    Ok(weights
        .iter()
        .map(|&weight| {
            let samples = epochs_f32 * (weight / maximum);
            epochs_f64 / f64::from(samples)
        })
        .collect())
}

#[expect(
    clippy::cast_precision_loss,
    reason = "the production parallel optimizer intentionally stores compact f32 schedules"
)]
fn make_epochs_per_sample_f32(weights: &[f32], epochs: usize) -> Result<Vec<f32>, UmapError> {
    let maximum = weights
        .iter()
        .copied()
        .reduce(f32::max)
        .ok_or(UmapError::EmptyGraph)?;
    let epochs = epochs as f32;
    Ok(weights
        .iter()
        .map(|&weight| epochs / (epochs * (weight / maximum)))
        .collect())
}

fn normalize_coordinates(mut coordinates: Vec<[f32; 2]>) -> Result<Vec<[f32; 2]>, UmapError> {
    let mut minimum = [f32::INFINITY; 2];
    let mut maximum = [f32::NEG_INFINITY; 2];
    for (row, coordinate) in coordinates.iter().enumerate() {
        for axis in 0..2 {
            let value = coordinate[axis];
            if !value.is_finite() {
                return Err(UmapError::NonFiniteCoordinate { row, axis, value });
            }
            minimum[axis] = minimum[axis].min(value);
            maximum[axis] = maximum[axis].max(value);
        }
    }

    let span = [maximum[0] - minimum[0], maximum[1] - minimum[1]];
    for (axis, &span) in span.iter().enumerate() {
        if span <= 0.0 || !span.is_finite() {
            return Err(UmapError::DegenerateCoordinateAxis(axis));
        }
    }

    for coordinate in &mut coordinates {
        for axis in 0..2 {
            coordinate[axis] = 10.0 * (coordinate[axis] - minimum[axis]) / span[axis];
        }
    }
    Ok(coordinates)
}

fn pair_mut(
    coordinates: &mut [[f32; 2]],
    left: usize,
    right: usize,
) -> (&mut [f32; 2], &mut [f32; 2]) {
    debug_assert_ne!(left, right);
    if left < right {
        let (before, after) = coordinates.split_at_mut(right);
        (&mut before[left], &mut after[0])
    } else {
        let (before, after) = coordinates.split_at_mut(left);
        (&mut after[0], &mut before[right])
    }
}

#[expect(
    clippy::suboptimal_flops,
    reason = "operation order intentionally matches the pinned numba kernel"
)]
fn squared_distance(left: [f32; 2], right: [f32; 2]) -> f32 {
    let x = left[0] - right[0];
    let y = left[1] - right[1];
    x * x + y * y
}

fn attractive_gradient_coefficient(distance_squared: f32, curve: CurveParameters) -> f64 {
    if distance_squared <= 0.0 {
        return 0.0;
    }
    let distance_squared = f64::from(distance_squared);
    let numerator = -2.0 * curve.a * curve.b * distance_squared.powf(curve.b - 1.0);
    numerator / (curve.a * distance_squared.powf(curve.b) + 1.0)
}

fn repulsive_gradient_coefficient(
    distance_squared: f32,
    curve: CurveParameters,
    repulsion_strength: f64,
) -> f64 {
    if distance_squared <= 0.0 {
        return 0.0;
    }
    let distance_squared = f64::from(distance_squared);
    let numerator = 2.0 * repulsion_strength * curve.b;
    numerator / ((0.001 + distance_squared) * (curve.a * distance_squared.powf(curve.b) + 1.0))
}

fn clip(value: f64) -> f64 {
    value.clamp(-4.0, 4.0)
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "umap-learn's tau RNG returns the low signed 32 bits"
)]
fn tau_rand_int(state: &mut [i64; 3]) -> i32 {
    state[0] = (((state[0] & 4_294_967_294) << 12) & 0xFFFF_FFFF)
        ^ ((((state[0] << 13) & 0xFFFF_FFFF) ^ state[0]) >> 19);
    state[1] = (((state[1] & 4_294_967_288) << 4) & 0xFFFF_FFFF)
        ^ ((((state[1] << 2) & 0xFFFF_FFFF) ^ state[1]) >> 25);
    state[2] = (((state[2] & 4_294_967_280) << 17) & 0xFFFF_FFFF)
        ^ ((((state[2] << 3) & 0xFFFF_FFFF) ^ state[2]) >> 11);
    (state[0] ^ state[1] ^ state[2]) as i32
}

#[cfg(test)]
mod tests {
    use std::{
        fs::File,
        io::BufReader,
        path::{Path, PathBuf},
    };

    use npyz::Deserialize;

    use super::*;

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
            SerialUmapOptions {
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
            SerialUmapOptions {
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
            SerialUmapOptions {
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
        assert_eq!(optimizer.epochs_per_sample, expected_epochs_per_sample);
        assert_eq!(
            optimizer.epochs_per_negative_sample,
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
            optimizer.random_calls,
            [224, 270, 310, 400, 331, 302, 286, 255]
        );
        assert_eq!(
            optimizer.random_states,
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
        let expected_loss = fuzzy_cross_entropy(&graph, &expected, optimizer.curve);
        let actual_loss = fuzzy_cross_entropy(&graph, optimizer.coordinates(), optimizer.curve);
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
}
