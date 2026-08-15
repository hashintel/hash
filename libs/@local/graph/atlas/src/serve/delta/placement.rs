//! The online projection placing arrivals through the generation's own publish path.
//!
//! A fitted row's published coordinate is not the checkpoint forward alone. The fit selects the
//! canonical rung and applies that rung's recorded similarity to every projected point, and the
//! aligned field then normalizes through the world frame onto the wire. [`Placer`] repeats
//! exactly that construction for one arrival. The checkpoint opens against the architecture the
//! metadata document echoes, the forward runs at the recorded canonical condition, and the
//! recorded alignment and world frame carry the point onto the wire. A generation whose ladder
//! never measured - a corpus without relation force - published the zero-condition frame
//! directly, and the placer repeats that arm the same way, forwarding at zero and skipping the
//! alignment step.
//!
//! The published generation records every input the construction needs. The architecture
//! and the forward slice bound come from the configuration echo, the canonical condition and its
//! alignment from the ladder evidence, and the world frame from the level-of-detail measurements,
//! so the placer needs no configuration of its own and cannot drift from the fit that published
//! the coordinates it extends.
//!
//! Construction certifies the replay before any arrival trusts it. The placer projects a sample
//! of the generation's own fitted rows and compares the aligned result against the published
//! coordinate column, per component in world units, under the ladder report's own reproduction
//! bound. A checkpoint, an echo, or a backend that does not reproduce the published bytes within
//! that bound would place arrivals on a lookalike map, so certification failure refuses the
//! serve.
//!
//! Every refusal fails closed, each under its own log line. [`Placer::open`] answers `Ok(None)`
//! for a baseline-placed generation alone, the one shape that promises no publish path, and
//! serving without a placer stages arrivals forever, the same disposition as a deployment
//! without a Temporal client. A generation that stages a projector checkpoint must reopen it:
//! every reopening failure is a [`PlacementError`], and the serve refuses to start rather than
//! silently staging every arrival. At runtime, an arrival projecting outside the frozen world
//! frame stays unplaced under a warning, because a clamped coordinate would serve a lie about
//! position. The frame comes from fit-time data, and the next refit recalibrates it.

use std::fs::File;

use hashql_core::id::{Id as _, IdSlice};

use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{array::ArrayFile, generation::Generation},
    math::{AlignedVecN, Bounds2, MatrixN, NonNegative, Similarity, Vec2},
    salt::{
        fit::{PlacementInner, PlacementOptions, placement_device},
        ladder::report::CERTIFICATE_TOLERANCE,
        lod::stage::WIRE_FRAME,
        projector::{
            artifact,
            model::{NodeRole, Projector},
            train::{batch::NodeColumns, refresh},
        },
    },
};

hashql_core::id::newtype! {
    /// A row of one projection batch.
    ///
    /// The ordinal is batch-local: it names a position in the slice handed to one forward call
    /// and nothing beyond it.
    #[id(const)]
    pub struct BatchRow(u32)
}

/// Rows per projection scratch buffer.
///
/// The bound sizes the aligned staging copy one forward call reads from. A larger batch loops.
const SCRATCH_ROWS: usize = 256;

/// Fitted rows the construction certificate projects.
///
/// The sample spreads evenly over the row domain, and rows project independently, so each sampled
/// row is its own reproduction check. The count keeps certification to a fraction of a second
/// while still crossing the whole domain.
const CERTIFICATE_ROWS: usize = 1024;

/// One arrival's projection outcome.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) enum Projection {
    /// The world coordinate lies inside the frozen frame, normalized onto the wire.
    Placed {
        /// The projected coordinate in the wire frame.
        wire: Vec2,
    },
    /// The world coordinate lies outside the frozen frame, so the arrival stays unplaced until a
    /// refit recalibrates the frame.
    OutOfFrame {
        /// The aligned coordinate in world units, for the caller's log line.
        world: Vec2,
    },
}

/// One projection batch failed on a non-finite coordinate.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct NonFiniteProjection {
    /// The failing row's position in the batch the caller handed over.
    pub row: usize,
}

/// The refusals that stop a staged projector checkpoint from reopening.
///
/// Each case logs its own line at the refusal site. The error names the case for the serve
/// refusal that carries it. A baseline-placed generation is not a refusal: it promises no
/// publish path, and [`Placer::open`] answers `Ok(None)` for it.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum PlacementError {
    /// The configuration echo records a baseline placement while the generation stages a
    /// projector checkpoint.
    EchoDisagrees,
    /// The generation stages a projector checkpoint without training evidence.
    MissingEvidence,
    /// The ladder evidence names a canonical rung outside its own schedule.
    CanonicalRung,
    /// The projector checkpoint does not open, or does not decode against the echoed
    /// architecture.
    Checkpoint,
    /// The reopened publish path does not reproduce the generation's own published coordinates.
    Certificate,
}

impl core::fmt::Display for PlacementError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::EchoDisagrees => fmt.write_str(
                "the generation stages a projector checkpoint while its configuration echo \
                 records a baseline placement",
            ),
            Self::MissingEvidence => fmt.write_str(
                "the generation stages a projector checkpoint without training evidence",
            ),
            Self::CanonicalRung => {
                fmt.write_str("the ladder evidence names a canonical rung outside its own schedule")
            }
            Self::Checkpoint => fmt.write_str(
                "the projector checkpoint does not open or does not decode against the echoed \
                 architecture",
            ),
            Self::Certificate => fmt.write_str(
                "the reopened publish path does not reproduce the generation's own published \
                 coordinates",
            ),
        }
    }
}

impl core::error::Error for PlacementError {}

/// The online half of the placement stage, bound to one published generation.
///
/// Holds the reopened checkpoint together with the recorded canonical condition, alignment, and
/// world frame, so [`project`](Self::project) is a pure function from stored embedding prefixes
/// to wire coordinates - the same function the fit applied to every fitted row.
pub(crate) struct Placer {
    /// The reopened checkpoint on the placement backend.
    model: Projector<PlacementInner>,
    /// The canonical rung's condition, or zero for a generation without a measured ladder.
    condition: NonNegative,
    /// The canonical rung's recorded similarity, or [`None`] where the zero frame published
    /// directly.
    alignment: Option<Similarity>,
    /// The recorded world frame the wire normalization maps from.
    world: Bounds2,
    /// The forward slice bound the configuration echo records.
    forward_rows: core::num::NonZero<usize>,
}

impl core::fmt::Debug for Placer {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.debug_struct("Placer")
            .field("condition", &self.condition)
            .field("alignment", &self.alignment)
            .field("world", &self.world)
            .field("forward_rows", &self.forward_rows)
            .finish_non_exhaustive()
    }
}

impl Placer {
    /// Opens the generation's publish path for online projection.
    ///
    /// Answers `Ok(None)` for a baseline-placed generation, the one shape that promises no
    /// publish path. Its arrivals stage until a refit.
    ///
    /// # Errors
    ///
    /// Refusals fail closed, each under its own log line at the refusal site:
    ///
    /// - [`PlacementError::EchoDisagrees`] when the placement discriminant and the configuration
    ///   echo disagree
    /// - [`PlacementError::MissingEvidence`] when the checkpoint stages without training evidence
    /// - [`PlacementError::CanonicalRung`] when the ladder evidence names a rung outside its own
    ///   schedule
    /// - [`PlacementError::Checkpoint`] when the checkpoint does not open or does not decode
    /// - [`PlacementError::Certificate`] when the reopened path does not reproduce the generation's
    ///   own published coordinates
    pub(crate) fn open(generation: &Generation) -> Result<Option<Self>, PlacementError> {
        let repository = generation.repository();
        let metadata = &repository.metadata;

        let Some(checkpoint) = &repository.files.projector else {
            tracing::info!(
                "the generation placed rows by landmark baseline, arrivals stage until a refit"
            );
            return Ok(None);
        };
        let PlacementOptions::Projector(options) = &metadata.reproducibility.config.placement
        else {
            tracing::warn!(
                "the generation stages a projector checkpoint while its configuration echo \
                 records a baseline placement"
            );
            return Err(PlacementError::EchoDisagrees);
        };
        let Some(evidence) = &metadata.evidence.projector else {
            tracing::warn!(
                "the generation stages a projector checkpoint without training evidence"
            );
            return Err(PlacementError::MissingEvidence);
        };

        let (condition, alignment) = match &evidence.ladder {
            Some(ladder) => {
                let Some(rung) = ladder.rungs.get(ladder.canonical_index) else {
                    tracing::warn!(
                        canonical_index = ladder.canonical_index,
                        rungs = ladder.rungs.len(),
                        "the ladder evidence names a canonical rung outside its own schedule"
                    );
                    return Err(PlacementError::CanonicalRung);
                };
                (ladder.canonical, Some(rung.alignment))
            }
            None => (NonNegative::ZERO, None),
        };

        let device = placement_device();
        let checkpoint = match File::open(generation.path_of(&checkpoint.name)) {
            Ok(file) => file,
            Err(error) => {
                tracing::warn!(%error, "the projector checkpoint does not open");
                return Err(PlacementError::Checkpoint);
            }
        };
        let model: Projector<PlacementInner> =
            match artifact::open_model(checkpoint, options.architecture, &device) {
                Ok(model) => model,
                Err(error) => {
                    tracing::warn!(
                        %error,
                        "the projector checkpoint does not decode against the echoed architecture"
                    );
                    return Err(PlacementError::Checkpoint);
                }
            };

        let placer = Self {
            model,
            condition,
            alignment,
            world: metadata.evidence.lod.world,
            forward_rows: options.forward_rows,
        };
        if placer.certify(generation) {
            Ok(Some(placer))
        } else {
            Err(PlacementError::Certificate)
        }
    }

    /// Certifies the reopened publish path against the published coordinate column.
    ///
    /// Projects an even sample of the generation's own fitted rows and compares each aligned
    /// coordinate against the published column, per component in world units, under the ladder
    /// report's reproduction bound. Returns whether every sampled row reproduces, logging the
    /// verdict either way with the sample width and the largest error observed.
    fn certify(&self, generation: &Generation) -> bool {
        let files = &generation.repository().files;

        let representations = match ArrayFile::open(generation.path_of(&files.representations.name))
        {
            Ok(file) => file,
            Err(error) => {
                tracing::warn!(%error, "the representation matrix does not open");
                return false;
            }
        };
        let Some(representations) = representations.vectors::<PROJECTOR_DIMENSIONS>() else {
            tracing::warn!("the representation matrix does not read as projector-width rows");
            return false;
        };

        let coordinates = match ArrayFile::open(generation.path_of(&files.coordinates.name)) {
            Ok(file) => file,
            Err(error) => {
                tracing::warn!(%error, "the coordinate column does not open");
                return false;
            }
        };
        let Some(coordinates) = coordinates.points() else {
            tracing::warn!("the coordinate column does not read as points");
            return false;
        };

        let rows = representations.len();
        if rows == 0 || rows != coordinates.len() {
            tracing::warn!(
                representations = rows,
                coordinates = coordinates.len(),
                "the representation matrix and the coordinate column do not describe one \
                 populated corpus"
            );
            return false;
        }

        let width = CERTIFICATE_ROWS.min(rows);
        #[expect(
            clippy::integer_division,
            clippy::integer_division_remainder_used,
            reason = "the floored stride spreads the sample evenly over the row domain"
        )]
        let sampled: Vec<usize> = (0..width).map(|index| index * rows / width).collect();
        let sampled_rows = sampled.iter().map(|&row| &representations[row]);
        let aligned = match self.forward_aligned(sampled_rows) {
            Ok(aligned) => aligned,
            Err(failure) => {
                tracing::warn!(
                    row = sampled[failure.row],
                    "a fitted row's reprojection is non-finite"
                );
                return false;
            }
        };

        let mut max_error = 0.0_f64;
        for (&row, reprojected) in sampled.iter().zip(&aligned) {
            let published = coordinates[row];
            let error = f64::from((reprojected.x() - published.x()).abs())
                .max(f64::from((reprojected.y() - published.y()).abs()));
            max_error = max_error.max(error);
        }

        if max_error < CERTIFICATE_TOLERANCE {
            tracing::info!(
                samples = width,
                rows,
                max_error,
                "the online projection reproduces the published coordinates"
            );
            true
        } else {
            tracing::warn!(
                samples = width,
                rows,
                max_error,
                tolerance = CERTIFICATE_TOLERANCE,
                "the online projection does not reproduce the published coordinates"
            );
            false
        }
    }

    /// Projects one batch of arrivals through the publish path.
    ///
    /// Each embedding is a stored whole-entity embedding's l2-normalized projector prefix, and
    /// each outcome is that row's wire coordinate or its out-of-frame world coordinate, in the
    /// batch's own order. The construction repeats the fit's own publish path over the batch, so
    /// a placed arrival and a fitted row take their coordinates from one function.
    ///
    /// # Errors
    ///
    /// Returns [`NonFiniteProjection`] naming the first row whose forward produced a non-finite
    /// coordinate. Rows after it were not projected, and the caller retries them.
    pub(super) fn project(
        &self,
        embeddings: impl IntoIterator<Item: AsRef<AlignedVecN<PROJECTOR_DIMENSIONS>>>,
    ) -> Result<Vec<Projection>, NonFiniteProjection> {
        let world = self.forward_aligned(embeddings)?;
        let wire = self.world.normalize_into(WIRE_FRAME, &world);

        Ok(world
            .iter()
            .zip(wire)
            .map(|(&point, wire)| {
                if self.world.contains(point) {
                    Projection::Placed { wire }
                } else {
                    Projection::OutOfFrame { world: point }
                }
            })
            .collect())
    }

    /// Forwards a batch through the checkpoint and aligns it into the baseline frame.
    ///
    /// The rows copy into an aligned scratch matrix in bounded slices, every row projects at the
    /// placer's condition under the knowledge-entity role, and the recorded alignment maps each
    /// point. The result is in world units, in the batch's own order.
    ///
    /// # Errors
    ///
    /// Returns [`NonFiniteProjection`] naming the first row whose forward produced a non-finite
    /// coordinate.
    fn forward_aligned(
        &self,
        rows: impl IntoIterator<Item: AsRef<AlignedVecN<PROJECTOR_DIMENSIONS>>>,
    ) -> Result<Vec<Vec2>, NonFiniteProjection> {
        let mut rows = rows.into_iter();
        let mut aligned = Vec::with_capacity(rows.size_hint().0);
        let mut scratch = MatrixN::<PROJECTOR_DIMENSIONS>::zeroed(SCRATCH_ROWS);
        let roles = vec![NodeRole::KnowledgeEntity; SCRATCH_ROWS];

        let mut base = 0;
        loop {
            let mut filled = 0;
            for (slot, row) in scratch.rows_mut().iter_mut().zip(&mut rows) {
                slot.as_array_mut().copy_from_slice(row.as_ref().as_array());
                filled += 1;
            }
            if filled == 0 {
                break;
            }

            let columns: NodeColumns<'_, BatchRow> = NodeColumns {
                representations: IdSlice::from_raw(&scratch.rows()[..filled]),
                roles: IdSlice::from_raw(&roles[..filled]),
            };

            let frame = refresh::forward(
                &self.model,
                columns,
                self.condition,
                self.forward_rows,
                &placement_device(),
            )
            .map_err(|error| match error {
                refresh::RefreshError::Diverged { row, .. }
                | refresh::RefreshError::NonFiniteScale { row, .. } => NonFiniteProjection {
                    row: base + row.as_usize(),
                },
            })?;

            match self.alignment {
                Some(alignment) => {
                    aligned.extend(frame.iter().map(|&point| alignment.apply(point)));
                }
                None => aligned.extend(frame.iter().copied()),
            }

            if filled < SCRATCH_ROWS {
                break;
            }
            base += filled;
        }

        Ok(aligned)
    }
}

#[cfg(test)]
mod tests {
    use core::num::NonZero;

    use rand::SeedableRng as _;
    use rand_xoshiro::Xoshiro256PlusPlus;

    use super::*;
    use crate::{
        math::{BoxedVecN, Rotation, non_negative},
        salt::projector::model::Architecture,
    };

    /// Batch rows spanning two scratch chunks plus a remainder.
    const CHUNKED_ROWS: usize = SCRATCH_ROWS * 2 + 2;

    fn architecture() -> Architecture {
        Architecture {
            width: NonZero::new(8).expect("fixture width is non-zero"),
            residual_blocks: NonZero::new(1).expect("fixture depth is non-zero"),
            representation_dimensions: NonZero::new(PROJECTOR_DIMENSIONS)
                .expect("the projector width is non-zero"),
            role_dimensions: NonZero::new(4).expect("fixture role width is non-zero"),
            condition_dimensions: NonZero::new(1).expect("fixture condition width is non-zero"),
        }
    }

    fn model() -> Projector<PlacementInner> {
        Projector::new(
            architecture(),
            &placement_device(),
            Xoshiro256PlusPlus::seed_from_u64(7),
        )
    }

    fn alignment() -> Similarity {
        Similarity::new(
            non_negative!(2.0),
            Rotation::from_radians(0.5),
            Vec2::new(3.0, -4.0),
        )
        .expect("the fixture scale is normal")
    }

    fn placer(alignment: Option<Similarity>, world: Bounds2) -> Placer {
        Placer {
            model: model(),
            condition: non_negative!(0.25),
            alignment,
            world,
            forward_rows: NonZero::new(64).expect("the fixture slice bound is non-zero"),
        }
    }

    /// A distinct unit-scale embedding per row.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the fixture ordinals stay far below the mantissa width"
    )]
    fn embedding(row: usize) -> BoxedVecN<PROJECTOR_DIMENSIONS> {
        let mut components = [0.0_f32; PROJECTOR_DIMENSIONS];
        for (index, component) in components.iter_mut().enumerate() {
            *component = ((row * PROJECTOR_DIMENSIONS + index) as f32).sin() * 0.05;
        }
        BoxedVecN::from(components)
    }

    /// Projects `embeddings` through the fit's own leaf calls: forward, alignment, wire frame.
    fn publish_path(
        placer: &Placer,
        embeddings: &[BoxedVecN<PROJECTOR_DIMENSIONS>],
    ) -> (Vec<Vec2>, Vec<Vec2>) {
        let mut scratch = BoxedVecN::<{ CHUNKED_ROWS * PROJECTOR_DIMENSIONS }>::zero();
        for (slot, row) in embeddings.iter().enumerate() {
            scratch.as_array_mut()[slot * PROJECTOR_DIMENSIONS..][..PROJECTOR_DIMENSIONS]
                .copy_from_slice(row.as_array());
        }
        let staged =
            AlignedVecN::from_slice(&scratch.as_array()[..embeddings.len() * PROJECTOR_DIMENSIONS])
                .expect("boxed scratch storage is aligned for whole projector rows");
        let roles = vec![NodeRole::KnowledgeEntity; embeddings.len()];
        let columns: NodeColumns<'_, BatchRow> = NodeColumns {
            representations: IdSlice::from_raw(staged),
            roles: IdSlice::from_raw(&roles),
        };

        let frame = refresh::forward(
            &placer.model,
            columns,
            placer.condition,
            placer.forward_rows,
            &placement_device(),
        )
        .expect("the fixture forward is finite");
        let world: Vec<Vec2> = placer.alignment.map_or_else(
            || frame.iter().copied().collect(),
            |alignment| frame.iter().map(|&point| alignment.apply(point)).collect(),
        );
        let wire = placer.world.normalize_into(WIRE_FRAME, &world);
        (world, wire)
    }

    /// World bounds covering every point of `world` with margin.
    fn covering(world: &[Vec2]) -> Bounds2 {
        let mut bounds = Bounds2::new(world[0], world[0]).expect("a fixture point is finite");
        for &point in world {
            bounds = bounds.union(Bounds2::new(point, point).expect("a fixture point is finite"));
        }
        Bounds2::new(
            Vec2::new(bounds.min().x() - 1.0, bounds.min().y() - 1.0),
            Vec2::new(bounds.max().x() + 1.0, bounds.max().y() + 1.0),
        )
        .expect("widened fixture bounds stay ordered")
    }

    #[test]
    fn the_online_projection_byte_equals_the_publish_path() {
        let embeddings: Vec<_> = (0..CHUNKED_ROWS).map(embedding).collect();

        // The probe learns where the fixture model puts the batch, and the placer under test
        // freezes a frame that contains every point.
        let probe = placer(Some(alignment()), WIRE_FRAME);
        let (world, _) = publish_path(&probe, &embeddings);
        let placer = placer(Some(alignment()), covering(&world));
        let (_, expected) = publish_path(&placer, &embeddings);

        let refs: Vec<&BoxedVecN<PROJECTOR_DIMENSIONS>> = embeddings.iter().collect();
        let projections = placer
            .project(&refs)
            .expect("the fixture forward is finite");

        assert_eq!(projections.len(), expected.len());
        for (projection, wire) in projections.iter().zip(&expected) {
            let Projection::Placed { wire: served } = projection else {
                panic!("every fixture point lies inside the covering frame");
            };
            assert_eq!(served.x().to_bits(), wire.x().to_bits());
            assert_eq!(served.y().to_bits(), wire.y().to_bits());
        }
    }

    #[test]
    fn a_ladder_less_generation_projects_at_zero_without_alignment() {
        let embeddings = vec![embedding(3), embedding(11)];

        let probe = Placer {
            condition: NonNegative::ZERO,
            ..placer(None, WIRE_FRAME)
        };
        let (world, _) = publish_path(&probe, &embeddings);
        let placer = Placer {
            condition: NonNegative::ZERO,
            ..placer(None, covering(&world))
        };
        let (_, expected) = publish_path(&placer, &embeddings);

        let refs: Vec<&BoxedVecN<PROJECTOR_DIMENSIONS>> = embeddings.iter().collect();
        let projections = placer
            .project(&refs)
            .expect("the fixture forward is finite");

        for (projection, wire) in projections.iter().zip(&expected) {
            let Projection::Placed { wire: served } = projection else {
                panic!("every fixture point lies inside the covering frame");
            };
            assert_eq!(served.x().to_bits(), wire.x().to_bits());
            assert_eq!(served.y().to_bits(), wire.y().to_bits());
        }
    }

    #[test]
    fn an_out_of_frame_coordinate_is_held_with_its_world_point() {
        let embeddings = vec![embedding(5)];

        let probe = placer(Some(alignment()), WIRE_FRAME);
        let (world, _) = publish_path(&probe, &embeddings);

        // A frame strictly past the projected point excludes it.
        let excluding = Bounds2::new(
            Vec2::new(world[0].x() + 10.0, world[0].y() + 10.0),
            Vec2::new(world[0].x() + 20.0, world[0].y() + 20.0),
        )
        .expect("the excluding fixture bounds are ordered");
        let placer = placer(Some(alignment()), excluding);

        let refs: Vec<&BoxedVecN<PROJECTOR_DIMENSIONS>> = embeddings.iter().collect();
        let projections = placer
            .project(&refs)
            .expect("the fixture forward is finite");

        assert_eq!(
            projections,
            vec![Projection::OutOfFrame { world: world[0] }]
        );
    }

    #[test]
    fn chunked_batches_project_each_row_as_its_own_batch_would() {
        let embeddings: Vec<_> = (0..CHUNKED_ROWS).map(embedding).collect();
        let probe = placer(Some(alignment()), WIRE_FRAME);
        let (world, _) = publish_path(&probe, &embeddings);
        let placer = placer(Some(alignment()), covering(&world));

        let refs: Vec<&BoxedVecN<PROJECTOR_DIMENSIONS>> = embeddings.iter().collect();
        let batched = placer
            .project(&refs)
            .expect("the fixture forward is finite");

        for row in [0, SCRATCH_ROWS - 1, SCRATCH_ROWS, CHUNKED_ROWS - 1] {
            let alone = placer
                .project(&refs[row..=row])
                .expect("the fixture forward is finite");
            assert_eq!(alone, vec![batched[row]], "row {row} moved under chunking");
        }
    }
}
