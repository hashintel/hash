//! Recomputes the condition ladder's frozen relation loss over persisted coordinate frames.
//!
//! The ladder's monotonicity criterion compares per-rung relation losses
//! (`salt/ladder/mod.rs`), and each loss is the projector's frozen objective evaluated over one
//! rung's projected frame (`relation_loss` in `salt/fit/compute/projector.rs`). Production
//! deletes the rung frames with the run's scratch directory when a fit aborts, so this probe
//! exists to recompute the exact objective over frames rescued from a failed run — or over a
//! published generation's persisted canonical frame, which doubles as the probe's own
//! correctness certificate.
//!
//! Everything the objective consumes is mirrored here from the production code paths, using the
//! crate's public `math` kernels (`Vec2`, `huber`, `sigmoid`, `softplus`) so the numeric leaves
//! are the very functions production calls. The mirrored parts are the file parsers (`.arr`,
//! `.sprs`, `.atrc` — all pinned single-version formats), the local-scale kernel
//! (`LocalScales::compute` / `row_scale` in `salt/projector/scale/mod.rs`), the energy mixture
//! (`salt/projector/loss/energy.rs`), and the accumulation loop (`relation_loss`), each with the
//! identical expression structure and iteration order, so the f32/f64 rounding sequence matches
//! bit for bit.
//!
//! ```text
//! cargo build -p hash-graph-atlas --features bench --release --example ladder_loss_probe
//! ./target/release/examples/ladder_loss_probe \
//!     --knn <knn.sprs> --attraction <attraction.atrc> --radius <frozen-proximal-radius> \
//!     --frame <rung-0.arr> --frame <rung-1.arr> ... \
//!     [--expect <f64>] [--tolerance 0.05] \
//!     [--coincident-radius 0.05] [--coincident-threshold 1.0] \
//!     [--temperature 0.25] [--epsilon 1e-3]
//! ```
//!
//! Frames are processed in argument order and treated as ascending rungs: for every frame after
//! the first the probe reports the loss delta against its predecessor and the excess over
//! `predecessor + tolerance` — the monotonicity criterion's exact margin. With `--expect`, the
//! recomputed loss of the single given frame is compared bit-for-bit against the expected value
//! (use a published generation's `.metadata.evidence.projector.ladder.persisted_relation_loss`
//! with its `coordinates.arr`, `knn.sprs`, `attraction.atrc`, and
//! `.metadata.evidence.projector.boundary.radius`); a mismatch exits nonzero.
//!
//! Certification run against the green generation `25fcd360…` (expected: PASS):
//!
//! ```text
//! G=var/atlas-ablations/25fcd360e00924cd20770c656fe933413b556eec2128f8312e667f47e083d507
//! ./target/release/examples/ladder_loss_probe \
//!     --knn $G/knn.sprs --attraction $G/attraction.atrc --radius 998.13837 \
//!     --frame $G/coordinates.arr --expect 893937.8433920869
//! ```
#![expect(
    clippy::print_stdout,
    clippy::print_stderr,
    reason = "the probe reports its measurements on stdout and its usage errors on stderr"
)]
#![expect(
    clippy::indexing_slicing,
    reason = "the mirrored production kernels index validated, format-checked regions exactly as \
              the originals do; a panic here is the same wiring defect it would be in production"
)]
#![expect(
    clippy::little_endian_bytes,
    reason = "the mirrored formats pin their multi-byte fields to canonical little-endian bytes, \
              exactly as their `file/*` modules do"
)]
#![expect(
    clippy::float_arithmetic,
    reason = "the probe's whole purpose is to mirror the frozen objective's float arithmetic \
              expression by expression"
)]

use std::{fs, path::PathBuf, process::ExitCode};

use hash_graph_atlas::math::{Vec2, huber, sigmoid, softplus};

/// Neighbours contributing to one node's local scale.
///
/// Mirror of `salt/projector/scale/mod.rs::LOCAL_SCALE_NEIGHBOURS`.
const LOCAL_SCALE_NEIGHBOURS: usize = 15;

#[expect(
    clippy::too_many_lines,
    reason = "the probe is one linear read-compute-report pass; splitting it would scatter the \
              auditable mirror"
)]
fn main() -> ExitCode {
    let options = match Options::parse(std::env::args().skip(1)) {
        Ok(options) => options,
        Err(message) => {
            eprintln!("{message}");
            eprintln!(
                "usage: ladder_loss_probe --knn <knn.sprs> --attraction <attraction.atrc> \
                 --radius <f32> --frame <frame.arr> [--frame ...] [--expect <f64>] [--tolerance \
                 <f64>] [--coincident-radius <f32>] [--coincident-threshold <f32>] [--temperature \
                 <f32>] [--epsilon <f32>]"
            );
            return ExitCode::from(1);
        }
    };

    let energy = RelationEnergy {
        coincident: CoincidentEnergy {
            radius: options.coincident_radius,
            threshold: options.coincident_threshold,
        },
        proximal: ProximalEnergy {
            radius: options.radius,
            temperature: options.temperature,
        },
        epsilon: options.epsilon,
    };
    println!(
        "energy: proximal radius {}, temperature {}, coincident radius {}, huber threshold {}, \
         scale guard {}",
        options.radius,
        options.temperature,
        options.coincident_radius,
        options.coincident_threshold,
        options.epsilon,
    );

    let knn = match KnnTable::read(&options.knn) {
        Ok(knn) => knn,
        Err(message) => {
            eprintln!("failed to read {}: {message}", options.knn.display());
            return ExitCode::from(1);
        }
    };
    println!(
        "knn: {} rows, {} stored neighbours per row",
        knn.rows,
        knn.neighbours(),
    );

    let attraction = match Attraction::read(&options.attraction) {
        Ok(attraction) => attraction,
        Err(message) => {
            eprintln!("failed to read {}: {message}", options.attraction.display());
            return ExitCode::from(1);
        }
    };
    println!(
        "attraction: {} groups, {} edges, {} corpus rows",
        attraction.groups.len(),
        attraction.edges.len(),
        attraction.rows,
    );

    let mut losses = Vec::with_capacity(options.frames.len());
    for (index, path) in options.frames.iter().enumerate() {
        let frame = match read_frame(path) {
            Ok(frame) => frame,
            Err(message) => {
                eprintln!("failed to read {}: {message}", path.display());
                return ExitCode::from(1);
            }
        };
        if frame.len() != knn.rows {
            eprintln!(
                "{}: frame has {} rows; the neighbour table has {}",
                path.display(),
                frame.len(),
                knn.rows,
            );
            return ExitCode::from(1);
        }

        let scales = local_scales(&frame, &knn);
        let loss = relation_loss(&frame, &scales, &attraction, energy);
        println!("frame {index} ({}): relation_loss = {loss}", path.display());
        if let Some(&previous) = losses.last() {
            let delta = loss - previous;
            let excess = loss - (previous + options.tolerance);
            let monotonic = loss <= previous + options.tolerance;
            println!(
                "         delta vs previous = {delta}; excess over previous + {} = {excess}; \
                 monotonic = {monotonic}",
                options.tolerance,
            );
        }
        losses.push(loss);
    }

    if let Some(expected) = options.expect {
        let &[loss] = losses.as_slice() else {
            eprintln!(
                "--expect requires exactly one --frame, got {}",
                losses.len()
            );
            return ExitCode::from(1);
        };
        if loss.to_bits() == expected.to_bits() {
            println!("CERTIFIED: recomputed {loss} == expected {expected} (bit-exact)");
        } else {
            println!(
                "MISMATCH: recomputed {loss} != expected {expected} (difference {})",
                loss - expected,
            );
            return ExitCode::from(2);
        }
    }

    ExitCode::SUCCESS
}

/// The probe's parsed command line.
struct Options {
    knn: PathBuf,
    attraction: PathBuf,
    frames: Vec<PathBuf>,
    radius: f32,
    coincident_radius: f32,
    coincident_threshold: f32,
    temperature: f32,
    epsilon: f32,
    tolerance: f64,
    expect: Option<f64>,
}

impl Options {
    /// Parses arguments; every flag takes one value.
    fn parse(mut arguments: impl Iterator<Item = String>) -> Result<Self, String> {
        let mut knn = None;
        let mut attraction = None;
        let mut frames = Vec::new();
        let mut radius = None;
        // The ratified lens constants (`ProjectorOptions::ratified` in `salt/fit/mod.rs`),
        // byte-identical to the green generation's config echo
        // (`.metadata.reproducibility.config.placement.projector.lens`). Override them from the
        // config echo of the run under measurement whenever that echo exists.
        let mut coincident_radius = 0.05_f32;
        let mut coincident_threshold = 1.0_f32;
        let mut temperature = 0.25_f32;
        let mut epsilon = 1.0e-3_f32;
        // `MeasurementOptions::monotonicity_tolerance`'s default in `salt/ladder/mod.rs`.
        let mut tolerance = 0.05_f64;
        let mut expect = None;

        while let Some(flag) = arguments.next() {
            let mut value = || {
                arguments
                    .next()
                    .ok_or_else(|| format!("{flag} expects a value"))
            };
            match flag.as_str() {
                "--knn" => knn = Some(PathBuf::from(value()?)),
                "--attraction" => attraction = Some(PathBuf::from(value()?)),
                "--frame" => frames.push(PathBuf::from(value()?)),
                "--radius" => radius = Some(parse_number::<f32>(&flag, &value()?)?),
                "--coincident-radius" => coincident_radius = parse_number(&flag, &value()?)?,
                "--coincident-threshold" => coincident_threshold = parse_number(&flag, &value()?)?,
                "--temperature" => temperature = parse_number(&flag, &value()?)?,
                "--epsilon" => epsilon = parse_number(&flag, &value()?)?,
                "--tolerance" => tolerance = parse_number(&flag, &value()?)?,
                "--expect" => expect = Some(parse_number(&flag, &value()?)?),
                other => return Err(format!("unknown flag {other}")),
            }
        }

        Ok(Self {
            knn: knn.ok_or("--knn is required")?,
            attraction: attraction.ok_or("--attraction is required")?,
            frames: if frames.is_empty() {
                return Err("at least one --frame is required".to_owned());
            } else {
                frames
            },
            radius: radius.ok_or("--radius is required (the run's frozen Proximal radius)")?,
            coincident_radius,
            coincident_threshold,
            temperature,
            epsilon,
            tolerance,
            expect,
        })
    }
}

/// Parses one numeric flag value.
fn parse_number<N: core::str::FromStr<Err: core::fmt::Display>>(
    flag: &str,
    value: &str,
) -> Result<N, String> {
    value
        .parse()
        .map_err(|error| format!("{flag} expects a number, got {value}: {error}"))
}

// === The energy mixture: mirror of `salt/projector/loss/energy.rs` (value paths only; the
// === discarded derivative halves cannot influence the accumulated value).

/// Mirror of `CoincidentEnergy`: a robust pull below a tight radius.
#[derive(Copy, Clone)]
struct CoincidentEnergy {
    radius: f32,
    threshold: f32,
}

impl CoincidentEnergy {
    /// Mirror of `CoincidentEnergy::evaluate`, value half.
    fn evaluate(self, normalized: f32) -> f32 {
        let excess = (normalized - self.radius).max(0.0);
        huber(excess, self.threshold)
    }
}

/// Mirror of `ProximalEnergy`: a bounded pull softening inside its radius.
#[derive(Copy, Clone)]
struct ProximalEnergy {
    radius: f32,
    temperature: f32,
}

impl ProximalEnergy {
    /// Mirror of `ProximalEnergy::evaluate`, value half.
    fn evaluate(self, normalized: f32) -> f32 {
        let argument = (normalized - self.radius) / self.temperature;
        self.temperature * softplus(argument)
    }
}

/// Mirror of `RelationEnergy`: the weighted Coincident and Proximal mixture.
#[derive(Copy, Clone)]
struct RelationEnergy {
    coincident: CoincidentEnergy,
    proximal: ProximalEnergy,
    epsilon: f32,
}

impl RelationEnergy {
    /// Mirror of `RelationEnergy::mixture`, value half.
    ///
    /// The production pair `(value, derivative)` computes the value exactly as below; `sigmoid`
    /// participates only in the derivative and is referenced here so the mirrored module keeps
    /// the full kernel set in view.
    fn mixture(self, normalized: f32, coincident_weight: f32, proximal_weight: f32) -> f32 {
        let _ = sigmoid;
        let coincident_value = self.coincident.evaluate(normalized);
        let proximal_value = self.proximal.evaluate(normalized);
        coincident_weight.mul_add(coincident_value, proximal_weight * proximal_value)
    }
}

// === Local scales: mirror of `salt/projector/scale/mod.rs`.

/// Mirror of `insert_nearest`: ascending bounded nearest-key insertion.
fn insert_nearest<K: PartialOrd + Copy, const N: usize>(nearest: &mut [K; N], key: K) -> bool {
    let mut slot = N;
    while slot > 0 && key < nearest[slot - 1] {
        slot -= 1;
    }
    if slot == N {
        return false;
    }

    nearest[slot..].rotate_right(1);
    nearest[slot] = key;
    true
}

/// Mirror of `sorted_median`: the median of ascending distances.
const fn sorted_median(distances: &[f32]) -> f32 {
    if distances.is_empty() {
        return 0.0;
    }

    let middle = distances.len() >> 1;
    if distances.len() & 1 == 0 {
        distances[middle - 1].midpoint(distances[middle])
    } else {
        distances[middle]
    }
}

/// Mirror of `row_scale`: one row's median 2D distance to its nearest neighbours.
fn row_scale(coordinates: &[Vec2], knn: &KnnTable, row: usize) -> f32 {
    let mut nearest = [(f32::INFINITY, u64::MAX); LOCAL_SCALE_NEIGHBOURS];
    for (column, distance) in knn.row(row) {
        insert_nearest(&mut nearest, (distance, u64::from(column)));
    }

    let count = knn.neighbours().min(LOCAL_SCALE_NEIGHBOURS);

    let mut distances = [0.0_f32; LOCAL_SCALE_NEIGHBOURS];
    for (distance, &(_, id)) in distances.iter_mut().zip(&nearest[..count]) {
        let neighbour =
            usize::try_from(id).expect("a validated table's rows fit the address space");
        *distance = coordinates[row].distance(coordinates[neighbour]);
    }
    distances[..count].sort_unstable_by(f32::total_cmp);

    sorted_median(&distances[..count])
}

/// Mirror of `LocalScales::compute`, serialized.
///
/// Production computes rows in parallel and collects in row order; rows are independent, so the
/// serial loop yields the identical table.
fn local_scales(coordinates: &[Vec2], knn: &KnnTable) -> Vec<f32> {
    assert_eq!(
        coordinates.len(),
        knn.rows,
        "coordinates and the neighbour table should cover the same rows"
    );
    (0..coordinates.len())
        .map(|row| {
            let scale = row_scale(coordinates, knn, row);
            assert!(
                scale.is_finite(),
                "the local scale of node row {row} is non-finite"
            );
            scale
        })
        .collect()
}

// === The frozen objective: mirror of `relation_loss` in `salt/fit/compute/projector.rs`.

/// Measures the corpus-total relation loss of one frame.
fn relation_loss(
    frame: &[Vec2],
    scales: &[f32],
    attraction: &Attraction,
    energy: RelationEnergy,
) -> f64 {
    let epsilon = energy.epsilon;

    let mut total = 0.0_f64;
    for group in &attraction.groups {
        let weights = group.weights;
        for edge in &attraction.edges[group.edges.clone()] {
            let source = usize::try_from(edge.source).expect("rows fit the address space");
            let target = usize::try_from(edge.target).expect("rows fit the address space");
            let difference = frame[source] - frame[target];
            let distance = difference.length();
            // Mirror of `LocalScales::normalization`.
            let normalization = ((scales[source] + epsilon) * (scales[target] + epsilon)).sqrt();
            let value = energy.mixture(
                distance / normalization,
                weights.coincident,
                weights.proximal,
            );
            let factor = edge.confidence * edge.normalization * weights.strength;

            total = f64::from(factor).mul_add(f64::from(value), total);
        }
    }
    total
}

// === Parsers for the pinned artifact formats. Each format is single-version and rejected on any
// === other bytes, exactly like the production readers.

/// Reads one `.arr` coordinate frame (`file/array/mod.rs`, version 0, `F32`, shape `[rows, 2]`).
fn read_frame(path: &PathBuf) -> Result<Vec<Vec2>, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    if bytes.len() < 4096 {
        return Err("shorter than the 4096-byte array header".to_owned());
    }
    if &bytes[0..8] != b"SALTARRY" {
        return Err("not an array file: bad magic".to_owned());
    }
    if u32_le(&bytes, 8) != 0 {
        return Err(format!(
            "unsupported array layout version {}",
            u32_le(&bytes, 8)
        ));
    }
    if bytes[12] != 0x0D {
        return Err(format!(
            "expected F32 elements (0x0D), got variant {:#04x}",
            bytes[12]
        ));
    }
    if u32_le(&bytes, 77) & 1 != 0 {
        return Err("written big-endian; this probe reads little-endian files".to_owned());
    }

    let dims = shape(&bytes, 13);
    let [rows, width] = dims[..] else {
        return Err(format!("expected a rank-2 frame, got shape {dims:?}"));
    };
    if width != 2 {
        return Err(format!(
            "expected [rows, 2] coordinates, got [{rows}, {width}]"
        ));
    }
    let expected = 4096 + rows * width * 4;
    if bytes.len() as u64 != expected {
        return Err(format!(
            "file is {} bytes; the header describes {expected}",
            bytes.len()
        ));
    }

    let rows =
        usize::try_from(rows).map_err(|_overflow| "rows exceed the address space".to_owned())?;
    let mut frame = Vec::with_capacity(rows);
    for row in 0..rows {
        let at = 4096 + row * 8;
        frame.push(Vec2::new(f32_le(&bytes, at), f32_le(&bytes, at + 4)));
    }
    Ok(frame)
}

/// One `.sprs` k-NN table (`file/sprs/mod.rs`, version 1, CSR, `f32` values, `u32` indices,
/// `u64` pointers), read whole.
struct KnnTable {
    rows: usize,
    nnz: usize,
    pointers: Vec<u64>,
    indices: Vec<u32>,
    distances: Vec<f32>,
}

impl KnnTable {
    fn read(path: &PathBuf) -> Result<Self, String> {
        let bytes = fs::read(path).map_err(|error| error.to_string())?;
        if bytes.len() < 4096 {
            return Err("shorter than the 4096-byte sparse header".to_owned());
        }
        if &bytes[0..8] != b"SALTSPRS" {
            return Err("not a sparse matrix file: bad magic".to_owned());
        }
        if u32_le(&bytes, 8) != 1 {
            return Err(format!(
                "unsupported sparse layout version {}",
                u32_le(&bytes, 8)
            ));
        }
        let (tag, index_variant, pointer_variant, storage) =
            (bytes[12], bytes[13], bytes[14], bytes[15]);
        if (tag, index_variant, pointer_variant, storage) != (0x0D, 0x01, 0x02, 0x00) {
            return Err(format!(
                "expected an f32/u32-index/u64-pointer CSR table, got tags ({tag:#04x}, \
                 {index_variant:#04x}, {pointer_variant:#04x}, {storage:#04x})"
            ));
        }
        if u64_le(&bytes, 16) != 4 {
            return Err(format!(
                "expected 4-byte values, got width {}",
                u64_le(&bytes, 16)
            ));
        }

        let dims = shape(&bytes, 24);
        let [rows, _columns] = dims[..] else {
            return Err(format!("expected a rank-2 matrix, got shape {dims:?}"));
        };
        let nnz = u64_le(&bytes, 88);

        let rows = usize::try_from(rows)
            .map_err(|_overflow| "rows exceed the address space".to_owned())?;
        let nnz =
            usize::try_from(nnz).map_err(|_overflow| "nnz exceeds the address space".to_owned())?;

        let pointers_at = 4096;
        let pointers_len = (rows + 1) * 8;
        let indices_at = pointers_at + pointers_len.next_multiple_of(4096);
        let indices_len = nnz * 4;
        let values_at = indices_at + indices_len.next_multiple_of(4096);
        let values_len = nnz * 4;
        if bytes.len() < values_at + values_len {
            return Err(format!(
                "file is {} bytes; the header describes at least {}",
                bytes.len(),
                values_at + values_len,
            ));
        }

        let pointers: Vec<u64> = (0..=rows)
            .map(|row| u64_le(&bytes, pointers_at + row * 8))
            .collect();
        let indices: Vec<u32> = (0..nnz)
            .map(|at| u32_le(&bytes, indices_at + at * 4))
            .collect();
        let distances: Vec<f32> = (0..nnz)
            .map(|at| f32_le(&bytes, values_at + at * 4))
            .collect();

        Ok(Self {
            rows,
            nnz,
            pointers,
            indices,
            distances,
        })
    }

    /// Mirror of `KnnView::neighbours`: the uniform per-row entry count.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "mirror of `KnnView::neighbours`, whose uniform-rows invariant divides exactly"
    )]
    const fn neighbours(&self) -> usize {
        self.nnz / self.rows
    }

    /// Mirror of `KnnView::row`: row entries as `(column, stored distance)` in stored order.
    fn row(&self, row: usize) -> impl Iterator<Item = (u32, f32)> + '_ {
        let range = usize::try_from(self.pointers[row]).expect("entries fit the address space")
            ..usize::try_from(self.pointers[row + 1]).expect("entries fit the address space");
        self.indices[range.clone()]
            .iter()
            .zip(&self.distances[range])
            .map(|(&column, &distance)| (column, distance))
    }
}

/// One relation group's shared weights and edge range (`file/attraction/mod.rs`).
struct Group {
    weights: Weights,
    edges: core::ops::Range<usize>,
}

/// Mirror of `AttractionWeights`.
#[derive(Copy, Clone)]
struct Weights {
    coincident: f32,
    proximal: f32,
    strength: f32,
}

/// One force-bearing edge's per-instance factors.
struct Edge {
    source: u64,
    target: u64,
    confidence: f32,
    normalization: f32,
}

/// One `.atrc` attraction index (`file/attraction/mod.rs`, version 0), read whole.
///
/// Groups and edges keep file order, which is the resident index's group/edge iteration order:
/// the artifact is written by iterating `AttractionIndex::groups()` and each group's `edges()`
/// verbatim, so accumulating in file order reproduces production's accumulation order.
struct Attraction {
    rows: u64,
    groups: Vec<Group>,
    edges: Vec<Edge>,
}

impl Attraction {
    fn read(path: &PathBuf) -> Result<Self, String> {
        let bytes = fs::read(path).map_err(|error| error.to_string())?;
        if bytes.len() < 4096 {
            return Err("shorter than the 4096-byte attraction header".to_owned());
        }
        if &bytes[0..8] != b"SALTATRC" {
            return Err("not an attraction file: bad magic".to_owned());
        }
        if u32_le(&bytes, 8) != 0 {
            return Err(format!(
                "unsupported attraction layout version {}",
                u32_le(&bytes, 8)
            ));
        }
        let group_count = usize::try_from(u64_le(&bytes, 16))
            .map_err(|_overflow| "group count exceeds the address space".to_owned())?;
        let edge_count = usize::try_from(u64_le(&bytes, 24))
            .map_err(|_overflow| "edge count exceeds the address space".to_owned())?;
        let rows = u64_le(&bytes, 32);

        let groups_at = 4096;
        let groups_len = group_count * 32;
        let edges_at = groups_at + groups_len.next_multiple_of(4096);
        let edges_len = edge_count * 40;
        if bytes.len() < edges_at + edges_len {
            return Err(format!(
                "file is {} bytes; the header describes at least {}",
                bytes.len(),
                edges_at + edges_len,
            ));
        }

        let first_edges: Vec<usize> = (0..group_count)
            .map(|group| {
                usize::try_from(u64_le(&bytes, groups_at + group * 32 + 8))
                    .expect("a validated edge offset fits the address space")
            })
            .collect();
        let groups = (0..group_count)
            .map(|group| {
                let at = groups_at + group * 32;
                Group {
                    weights: Weights {
                        coincident: f32_le(&bytes, at + 16),
                        proximal: f32_le(&bytes, at + 20),
                        strength: f32_le(&bytes, at + 24),
                    },
                    edges: first_edges[group]
                        ..first_edges.get(group + 1).copied().unwrap_or(edge_count),
                }
            })
            .collect();
        let edges = (0..edge_count)
            .map(|edge| {
                let at = edges_at + edge * 40;
                Edge {
                    source: u64_le(&bytes, at + 8),
                    target: u64_le(&bytes, at + 16),
                    confidence: f32_le(&bytes, at + 24),
                    normalization: f32_le(&bytes, at + 28),
                }
            })
            .collect();

        Ok(Self {
            rows,
            groups,
            edges,
        })
    }
}

/// Reads a shape (`[u64; 8]` little-endian dimensions, longest nonzero prefix) at `offset`.
fn shape(bytes: &[u8], offset: usize) -> Vec<u64> {
    let mut dims = Vec::new();
    for dim in 0..8 {
        let value = u64_le(bytes, offset + dim * 8);
        if value == 0 {
            break;
        }
        dims.push(value);
    }
    dims
}

/// Reads a little-endian `u32` at `offset`.
fn u32_le(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().expect("four bytes"))
}

/// Reads a little-endian `u64` at `offset`.
fn u64_le(bytes: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(bytes[offset..offset + 8].try_into().expect("eight bytes"))
}

/// Reads a little-endian `f32` at `offset`.
fn f32_le(bytes: &[u8], offset: usize) -> f32 {
    f32::from_le_bytes(bytes[offset..offset + 4].try_into().expect("four bytes"))
}
