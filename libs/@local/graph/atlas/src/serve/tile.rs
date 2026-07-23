//! Tile delivery.
//!
//! One `z/x/y` request answered with `SALTILET` envelope bytes, in delta or total mode, with the
//! `TYPE_MASK` column riding requests that color types.

use core::{error::Error, fmt, ops::Range};

use super::{
    Atlas, Filter, Mode, TileCoordinate, cell_of,
    color::MaskSet,
    depth_of,
    detail::{DeliveredEntities, NodeDetails},
    narrow,
    visibility::VisibilityProof,
};
use crate::{
    bitset::BitSet,
    file::quad::Node,
    math::Bounds2,
    morton::{Depth, MortonCell},
    salt::wire::tile::{DeliveredSet, GlobalHead, TileHead, TileResponse, TileTrailer},
};

/// The tile endpoint's request caps.
///
/// Transport configuration with documented defaults, never wire constants: the transport constructs
/// one value and the manifest publishes the same value, so enforcement and advertisement cannot
/// disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TileCaps {
    /// Most `coloredTypeIds` entries one request may carry.
    ///
    /// The manifest publishes this value as `limits.coloredTypeIds`. Defaults to 32 - at that
    /// ceiling the `TYPE_MASK` stride is four bytes per point.
    pub colored_type_ids: u32 = 32,
}

const impl Default for TileCaps {
    fn default() -> Self {
        Self { .. }
    }
}

/// A tile request was rejected.
///
/// Every variant is a named, data-carrying rejection for the transport layer to map onto its error
/// vocabulary; none of them can result from a well-formed request against the serving contract's
/// limits, which the manifest publishes as data.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TileError {
    /// The request carries more `coloredTypeIds` than the cap admits.
    Types {
        /// The carried id count.
        count: usize,
        /// The cap the manifest publishes as `limits.coloredTypeIds`.
        maximum: u32,
    },
    /// The zoom exceeds the generation's deepest served tile.
    Depth {
        /// The requested zoom.
        z: u8,
        /// The generation's deepest served zoom.
        maximum: u8,
    },
    /// The coordinate lies outside the zoom's `2^z` grid.
    Grid {
        /// The requested zoom.
        z: u8,
        /// The requested x index.
        x: u32,
        /// The requested y index.
        y: u32,
    },
    /// The request names a feature this build does not serve.
    ///
    /// The carried name is the request field.
    Unsupported(&'static str),
}

impl fmt::Display for TileError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Types { count, maximum } => {
                write!(
                    fmt,
                    "the request carries {count} colored type ids where the cap admits {maximum}"
                )
            }
            Self::Depth { z, maximum } => {
                write!(fmt, "zoom {z} exceeds the deepest served tile {maximum}")
            }
            Self::Grid { z, x, y } => {
                write!(fmt, "({x}, {y}) lies outside the 2^{z} tile grid")
            }
            Self::Unsupported(feature) => {
                write!(fmt, "this build does not serve {feature} requests")
            }
        }
    }
}

impl Error for TileError {}

/// The query context of one tile request: the ratified POST body, every field optional.
#[derive(Debug, Clone, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TileQuery {
    /// The delivery mode; delta when the request names none.
    #[serde(default)]
    pub mode: Mode,
    /// Versioned type ids conditioning the `TYPE_MASK` column, in request order.
    #[serde(default)]
    pub colored_type_ids: Vec<String>,
    /// The visibility filter; absent means the trivial bitmap.
    #[serde(default)]
    pub filter: Option<Filter>,
    /// Whether the detail trailer rides the response.
    #[serde(default)]
    pub include_detailed_data: bool,
}

/// One tile read.
///
/// The route's coordinate plus the body's query context, joined by the transport layer.
#[derive(Debug, Clone)]
pub struct TileRequest {
    /// The tile address from the route.
    pub coordinate: TileCoordinate,
    /// The query context from the request body.
    pub query: TileQuery,
}

/// One assembled tile.
///
/// Everything [`Atlas::encode_tile`] needs except the columns it gathers at encode time.
///
/// The document owns its derived data, so it crosses thread boundaries between assembly, hydration,
/// and encoding - the envelope was designed for hydration-last, and the split mirrors it: assembly
/// and encoding are CPU-bound, hydration awaits the store between them.
#[derive(Debug)]
pub struct TileDocument {
    coordinate: TileCoordinate,
    mode: Mode,
    visible: u64,
    first_bucket: u8,
    runs: Vec<u32>,
    delivered: DeliveredPoints,
    backfilled: u32,
    children: u8,
    global: Option<GlobalHead>,
    mask_set: Option<MaskSet>,
}

/// One masked level's delivery outcome.
#[derive(Debug, Copy, Clone)]
struct LevelDelivery {
    /// Points the fill pulled up from deeper buckets.
    backfilled: u32,
    /// The fill ended short of budget: the extent's deeper visible pool is spent.
    exhausted: bool,
}

/// A masked delivery with the chain state the response's other derivations read.
#[derive(Debug)]
struct BackfilledDelivery {
    /// The gathered positions, natural runs first, the fill tail after.
    delivered: DeliveredPoints,
    /// Per-bucket natural counts.
    runs: Vec<u32>,
    /// The tail's length.
    backfilled: u32,
    /// Every position any chain level delivered.
    taken: BitSet,
    /// An ancestor's fill spent the subtree: nothing below this tile is left to deliver.
    dry: bool,
}

/// The document's delivered point set.
///
/// Borrowed-shape ranges when every row is visible, a gathered ascending position list under a
/// mask.
#[derive(Debug)]
enum DeliveredPoints {
    /// Contiguous base-position ranges in delivery order.
    Ranges(Vec<Range<u32>>),
    /// Gathered base positions, ascending, visibility already applied.
    Positions(Vec<u32>),
}

impl DeliveredPoints {
    /// Views the set in the wire encoder's borrowed shape.
    const fn as_wire(&self) -> DeliveredSet<'_> {
        match self {
            Self::Ranges(ranges) => DeliveredSet::Ranges(ranges),
            Self::Positions(list) => DeliveredSet::Positions(list),
        }
    }

    /// Counts the delivered points.
    fn count(&self) -> usize {
        match self {
            Self::Ranges(ranges) => ranges.iter().map(Range::len).sum(),
            Self::Positions(list) => list.len(),
        }
    }

    /// Visits the delivered base positions in delivery order.
    fn for_each(&self, mut visit: impl FnMut(u32)) {
        match self {
            Self::Ranges(ranges) => {
                for range in ranges {
                    for position in range.clone() {
                        visit(position);
                    }
                }
            }
            Self::Positions(list) => {
                for &position in list {
                    visit(position);
                }
            }
        }
    }
}

impl Atlas {
    /// Answers one tile request without the detail trailer.
    ///
    /// `SALTILET` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`.
    ///
    /// A request that sets `includeDetailedData` is rejected by name: this path serves deployments
    /// without a store connection. A transport with one assembles, hydrates, and encodes through
    /// [`Atlas::assemble_tile`], [`Atlas::delivered_entities`], and [`Atlas::encode_tile`].
    ///
    /// # Errors
    ///
    /// As [`Atlas::assemble_tile`], plus [`TileError::Unsupported`] when the query sets
    /// `includeDetailedData`.
    pub fn tile(
        &self,
        request: &TileRequest,
        caps: TileCaps,
        proof: &VisibilityProof,
    ) -> Result<Vec<u8>, TileError> {
        if request.query.include_detailed_data {
            return Err(TileError::Unsupported("includeDetailedData"));
        }

        let document = self.assemble_tile(request, caps, proof)?;
        Ok(self.encode_tile(&document, None))
    }

    /// Assembles one tile request into its owned document.
    ///
    /// Every rejection happens here, so encoding cannot fail.
    ///
    /// The `TYPE_MASK` column rides exactly the requests that supply `coloredTypeIds`: bit `i` of a
    /// point's mask reads 1 when the point carries the request's type `i` or one of its
    /// descendants. An id that resolves to no type in this generation is legal and reads 0 in every
    /// mask.
    ///
    /// The delivered set, the per-bucket runs, and every occupancy-derived `HEAD` field (`visible`
    /// counts, the `children` bitmask, the root's global metadata) are computed over the masked
    /// view: a hidden point contributes to none of them, so a scope's tile carries no evidence of
    /// what the mask removed - a fully masked tile is a tile that never had rows.
    ///
    /// Version 0 serves the full unfiltered visible set in both modes; a request naming a filter is
    /// rejected by name rather than answered with bytes that silently ignore it.
    ///
    /// # Errors
    ///
    /// Returns [`TileError::Types`] when the request carries more `coloredTypeIds` than
    /// `caps.colored_type_ids`, [`TileError::Depth`] when the zoom exceeds the generation's deepest
    /// served tile, [`TileError::Grid`] when the coordinate lies outside the zoom's grid, and
    /// [`TileError::Unsupported`] when the query names a version-0 deferral.
    pub fn assemble_tile(
        &self,
        request: &TileRequest,
        caps: TileCaps,
        proof: &VisibilityProof,
    ) -> Result<TileDocument, TileError> {
        if request.query.filter.is_some() {
            return Err(TileError::Unsupported("filter"));
        }

        if request.query.colored_type_ids.len() > caps.colored_type_ids as usize {
            return Err(TileError::Types {
                count: request.query.colored_type_ids.len(),
                maximum: caps.colored_type_ids,
            });
        }

        let coordinate = request.coordinate;
        let maximum = self.lod.max_tile_depth;
        if coordinate.z > maximum {
            return Err(TileError::Depth {
                z: coordinate.z,
                maximum,
            });
        }

        let cell = cell_of(coordinate).ok_or(TileError::Grid {
            z: coordinate.z,
            x: coordinate.x,
            y: coordinate.y,
        })?;

        // The zoom's cut: buckets at or below z + span are
        // delivered by zoom z's cumulative schedule, and the tile's
        // own bucket is the cut itself. Bounded by the deepest grid,
        // which open validated against the key width.
        let cut = depth_of(coordinate.z + self.lod.span.get());

        let node = self.node_of(cell);
        let (first_bucket, runs, ranges) = match (request.query.mode, coordinate.z) {
            (Mode::Delta, 0) => self.root_delta(cut),
            (Mode::Delta, _) => delta(cut, node),
            (Mode::Total, _) => self.total(cut, cell),
        };

        let (delivered, runs, backfilled, children) = if proof.is_full() {
            let children = node.map_or(0, occupied_children);
            (DeliveredPoints::Ranges(ranges), runs, 0, children)
        } else {
            let delivery = self.gather_backfilled(coordinate, request.query.mode, proof);
            let children = if delivery.dry {
                // The subtree's visible points are all delivered; nothing below says descend.
                0
            } else {
                node.map_or(0, |node| {
                    self.visible_children(node, proof, &delivery.taken)
                })
            };
            (
                delivery.delivered,
                delivery.runs,
                delivery.backfilled,
                children,
            )
        };

        let visible = if coordinate.z == 0 {
            proof.visible_below(self.morton.count())
        } else if proof.is_full() {
            node.map_or_else(|| self.population(cell), |node| u64::from(node.points()))
        } else {
            self.visible_population(cell, proof)
        };

        let global = (coordinate.z == 0).then(|| self.global_head(cut, proof));

        let mask_set = (!request.query.colored_type_ids.is_empty())
            .then(|| self.resolve_masks(&request.query.colored_type_ids));

        Ok(TileDocument {
            coordinate,
            mode: request.query.mode,
            visible,
            first_bucket,
            runs,
            delivered,
            backfilled,
            children,
            global,
            mask_set,
        })
    }

    /// Gathers a masked delivery: the scheduled survivors plus the pull-up fill.
    ///
    /// The cascade guarantees every occupied cell of a cut's grid a representative at or above
    /// the cut, so an unmasked delivery is never empty for an occupied extent. A mask breaks that
    /// guarantee for the scheduled points alone; the fill restores it from below: each level
    /// delivers what the proof admits of its schedule, then pulls visible, undelivered points up
    /// from deeper buckets until the schedule's own count is met - a masked view's tile is as
    /// full as the visible world can make it, and its density mirrors the schedule's.
    ///
    /// Delivery is deterministic per `(generation, proof)` and never repeats a point down the
    /// zoom ladder: [`Self::deliver_level`] re-derives every ancestor's delivery first, so this
    /// level's fill starts where the chain left off. A delta response carries this level's
    /// additions alone; a total response carries the whole chain's deliveries within the extent -
    /// the natural runs first, the fill tail after, `backfilled` counting the tail.
    fn gather_backfilled(
        &self,
        coordinate: TileCoordinate,
        mode: Mode,
        proof: &VisibilityProof,
    ) -> BackfilledDelivery {
        let universe = usize::try_from(self.morton.count()).expect("base positions fit usize");
        let mut taken = BitSet::new(universe);
        let mut out = Vec::new();
        let mut runs = Vec::new();

        let mut dry = false;
        for level in 0..coordinate.z {
            let shift = coordinate.z - level;
            let ancestor = TileCoordinate {
                z: level,
                x: coordinate.x >> shift,
                y: coordinate.y >> shift,
            };
            out.clear();
            runs.clear();
            if self
                .deliver_level(ancestor, proof, &mut taken, &mut out, &mut runs)
                .exhausted
            {
                // Every descendant extent is a subset of this level's, whose deeper visible
                // pool the fill spent: the rest of the chain and this tile deliver nothing new.
                dry = true;
                break;
            }
        }

        match mode {
            Mode::Delta => {
                out.clear();
                runs.clear();
                let backfilled = if dry {
                    // The one delta run keeps its positional slot, empty.
                    runs.push(0);
                    0
                } else {
                    self.deliver_level(coordinate, proof, &mut taken, &mut out, &mut runs)
                        .backfilled
                };
                BackfilledDelivery {
                    delivered: DeliveredPoints::Positions(out),
                    runs,
                    backfilled,
                    taken,
                    dry,
                }
            }
            Mode::Total => {
                // The chain through this level settles which deeper points were pulled up; a
                // dry chain already settled them all.
                if !dry {
                    out.clear();
                    runs.clear();
                    self.deliver_level(coordinate, proof, &mut taken, &mut out, &mut runs);
                }

                let cell = cell_of(coordinate).expect("assembly validated the coordinate");
                let cut = coordinate.z + self.lod.span.get();
                let row_ids = self.row_ids();

                // Every visible scheduled point is delivered by its own level of the chain, so
                // the cumulative natural segment is the schedule's visible survivors verbatim.
                let mut cumulative = Vec::new();
                let mut cumulative_runs = Vec::with_capacity(usize::from(cut) + 1);
                for bucket in 0..=cut {
                    let run = self.morton.run(depth_of(bucket), cell);
                    let before = cumulative.len();
                    for position in run {
                        let position = narrow(position);
                        if proof.contains(row_ids[position as usize]) {
                            cumulative.push(position);
                        }
                    }
                    cumulative_runs.push(narrow((cumulative.len() - before) as u64));
                }

                // The tail: deeper extent points some level of the chain pulled up. Taken
                // positions are visible by construction.
                let deepest = u8::try_from(self.deepest_occupied()).expect("buckets fit u8");
                let mut backfilled = 0_u32;
                for bucket in (cut + 1)..=deepest {
                    let run = self.morton.run(depth_of(bucket), cell);
                    for position in run {
                        let position = narrow(position);
                        if taken.contains(position as usize) {
                            cumulative.push(position);
                            backfilled += 1;
                        }
                    }
                }

                BackfilledDelivery {
                    delivered: DeliveredPoints::Positions(cumulative),
                    runs: cumulative_runs,
                    backfilled,
                    taken,
                    dry,
                }
            }
        }
    }

    /// Delivers one level's delta under the mask, filling to the schedule's budget.
    ///
    /// The level's schedule is bucket `z + span` within its cell - buckets `0..=span` whole for
    /// the root - and its budget is the scheduled count before masking. Scheduled points the
    /// proof admits and no earlier level took deliver first, recounted into `runs` per bucket;
    /// the fill then walks deeper buckets in order, morton order within a bucket, pulling
    /// visible, untaken points until the budget is met or the subtree is exhausted. Every
    /// delivered position lands in `taken` and `out`.
    fn deliver_level(
        &self,
        coordinate: TileCoordinate,
        proof: &VisibilityProof,
        taken: &mut BitSet,
        out: &mut Vec<u32>,
        runs: &mut Vec<u32>,
    ) -> LevelDelivery {
        let row_ids = self.row_ids();
        let cell = cell_of(coordinate).expect("ancestors of a validated coordinate stay on grid");
        let cut = coordinate.z + self.lod.span.get();

        let first = if coordinate.z == 0 { 0 } else { cut };
        let mut budget = 0_usize;
        let mut delivered = 0_usize;
        for bucket in first..=cut {
            let run = self.morton.run(depth_of(bucket), cell);
            budget += usize::try_from(run.end - run.start).expect("runs fit usize");
            let before = out.len();
            for position in run {
                let position = narrow(position);
                if proof.contains(row_ids[position as usize]) && !taken.contains(position as usize)
                {
                    taken.insert(position as usize);
                    out.push(position);
                }
            }
            runs.push(narrow((out.len() - before) as u64));
            delivered += out.len() - before;
        }

        let mut backfilled = 0_u32;
        if delivered < budget {
            let deepest = u8::try_from(self.deepest_occupied()).expect("buckets fit u8");
            'fill: for bucket in (cut + 1)..=deepest {
                let run = self.morton.run(depth_of(bucket), cell);
                for position in run {
                    let position = narrow(position);
                    if proof.contains(row_ids[position as usize])
                        && !taken.contains(position as usize)
                    {
                        taken.insert(position as usize);
                        out.push(position);
                        backfilled += 1;
                        if delivered + backfilled as usize == budget {
                            break 'fill;
                        }
                    }
                }
            }
        }

        // A shortfall after the fill means the extent's deeper visible pool is spent.
        LevelDelivery {
            backfilled,
            exhausted: delivered + (backfilled as usize) < budget,
        }
    }

    /// Reads the occupied-child bitmask over the masked view.
    ///
    /// Bit `i` set when Morton child `i` holds a visible point below this zoom's cut that no
    /// level of the delivery chain already pulled up.
    ///
    /// The walk descends each child's quad subtree and scans every node's own-bucket run until an
    /// undelivered visible row surfaces, so a child whose subtree the mask empties - or whose
    /// visible points this response's fill already delivered - reads unoccupied: the client never
    /// fetches a tile that has nothing left to say, and the bitmask carries no evidence that
    /// hidden points exist.
    fn visible_children(&self, node: &Node, proof: &VisibilityProof, taken: &BitSet) -> u8 {
        let mut bits = 0_u8;

        for (index, quadrant) in node.children().iter().enumerate() {
            let &Some(child) = quadrant else { continue };
            let occupied = self.subtree_has_visible(child, proof, taken);

            bits |= u8::from(occupied) << index;
        }

        bits
    }

    /// Returns whether any node in the quad subtree rooted at `index` delivers a visible,
    /// untaken row.
    fn subtree_has_visible(&self, index: u32, proof: &VisibilityProof, taken: &BitSet) -> bool {
        let row_ids = self.row_ids();
        let nodes = self.quad.nodes();

        let mut stack = vec![index];
        while let Some(index) = stack.pop() {
            let node = &nodes[index as usize];
            for position in node.run() {
                let position = usize::try_from(position).expect("base positions fit usize");
                if proof.contains(row_ids[position]) && !taken.contains(position) {
                    return true;
                }
            }

            for quadrant in 0..4 {
                if let Some(child) = node.child(quadrant) {
                    stack.push(child);
                }
            }
        }

        false
    }

    /// Counts the visible points of `cell` across every occupied bucket.
    ///
    /// [`Self::population`] over the masked view.
    fn visible_population(&self, cell: MortonCell, proof: &VisibilityProof) -> u64 {
        let row_ids = self.row_ids();
        let lengths = self.morton.fenceposts().lengths();

        let mut population = 0;

        for depth in 0..=Depth::MAX.get() {
            if lengths[depth as usize] == 0 {
                continue;
            }

            population += self
                .morton
                .run(depth_of(depth), cell)
                .filter(|&position| {
                    proof.contains(
                        row_ids[usize::try_from(position).expect("base positions fit usize")],
                    )
                })
                .count() as u64;
        }

        population
    }

    /// Assembles the root's global metadata over the masked view.
    ///
    /// The visible delivered count, the tight extent of the visible set, and its deepest occupied
    /// bucket.
    fn global_head(&self, cut: Depth, proof: &VisibilityProof) -> GlobalHead {
        if proof.is_full() {
            return GlobalHead {
                visible: self.morton.fenceposts().segment(cut).end,
                bounds: self.bounds,
                min_resolution: self.deepest_occupied(),
            };
        }

        let row_ids = self.row_ids();
        let positions = self.positions();
        let end = self.morton.fenceposts().segment(cut).end;
        let visible = (0..end)
            .filter(|&position| {
                proof
                    .contains(row_ids[usize::try_from(position).expect("base positions fit usize")])
            })
            .count() as u64;

        let bounds = Bounds2::from_points(
            row_ids
                .iter()
                .zip(positions)
                .filter(|&(&row, _)| proof.contains(row))
                .map(|(_, &point)| point),
        );

        let min_resolution = (0..=Depth::MAX.get())
            .rev()
            .find(|&bucket| {
                self.morton
                    .fenceposts()
                    .segment(depth_of(bucket))
                    .any(|position| {
                        proof.contains(
                            row_ids[usize::try_from(position).expect("base positions fit usize")],
                        )
                    })
            })
            .map_or(0, u64::from);

        GlobalHead {
            visible,
            bounds,
            min_resolution,
        }
    }

    /// Gathers the entity identities behind the document's delivered set, in delivered order.
    ///
    /// The hydration request's subject.
    ///
    /// # Panics
    ///
    /// Panics when the identity table contradicts the row column, which open's cross-artifact
    /// validation rules out.
    #[must_use]
    pub fn delivered_entities(&self, document: &TileDocument) -> DeliveredEntities {
        let row_ids = self.row_ids();
        let mut ids = Vec::with_capacity(document.delivered.count());

        document.delivered.for_each(|position| {
            let row = row_ids[position as usize];
            ids.push(
                self.node_ids
                    .id(u64::from(row))
                    .expect("open validated the identity rows against the code column"),
            );
        });

        DeliveredEntities::new(ids)
    }

    /// Encodes an assembled document.
    ///
    /// `SALTILET` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`, with the
    /// detail trailer riding iff `details` is supplied.
    ///
    /// # Panics
    ///
    /// Panics when supplied details do not cover the document's delivered points - a transport bug,
    /// never request data.
    #[must_use]
    pub fn encode_tile(&self, document: &TileDocument, details: Option<&NodeDetails>) -> Vec<u8> {
        let masks = document
            .mask_set
            .as_ref()
            .map(|set| set.memberships(&self.postings));
        let labels: Option<Vec<Option<&str>>> =
            details.map(|details| details.labels().iter().map(Option::as_deref).collect());
        let icons: Option<Vec<Option<&str>>> =
            details.map(|details| details.icons().iter().map(Option::as_deref).collect());
        let trailer = labels
            .as_ref()
            .zip(icons.as_ref())
            .map(|(labels, icons)| TileTrailer { labels, icons });

        let response = TileResponse {
            head: TileHead {
                generation: self.generation.id().digest(),
                variant: 0,
                coordinate: document.coordinate,
                mode: document.mode,
                visible: document.visible,
                first_bucket: document.first_bucket,
                runs: &document.runs,
                global: document.global,
                children: document.children,
                backfilled: u64::from(document.backfilled),
            },
            delivered: document.delivered.as_wire(),
            positions: self.positions(),
            rows: self.wire_rows(),
            masks: masks.as_deref(),
            trailer,
        };

        response.encode()
    }

    /// Returns the quad node owning `cell`.
    ///
    /// [`None`] when the schedule delivers nothing new at or below it.
    fn node_of(&self, cell: MortonCell) -> Option<&Node> {
        let index = self.quad.locate(cell)?;
        Some(&self.quad.nodes()[index as usize])
    }

    /// Assembles the zoom-0 delta delivery.
    ///
    /// Buckets `0..=m` as fencepost differences, one contiguous base-order range.
    #[expect(
        clippy::single_range_in_vec_init,
        reason = "an array of one range is what a delta delivery IS"
    )]
    fn root_delta(&self, cut: Depth) -> (u8, Vec<u32>, Vec<Range<u32>>) {
        let lengths = self.morton.fenceposts().lengths();
        let runs = lengths[..=cut.get() as usize]
            .iter()
            .map(|&length| narrow(length))
            .collect();
        let end = narrow(self.morton.fenceposts().segment(cut).end);

        (0, runs, vec![0..end])
    }

    /// Assembles a total delivery.
    ///
    /// One code-column run per bucket of the cumulative schedule, bucket-major.
    fn total(&self, cut: Depth, cell: MortonCell) -> (u8, Vec<u32>, Vec<Range<u32>>) {
        let mut runs = Vec::with_capacity(cut.get() as usize + 1);
        let mut ranges = Vec::with_capacity(cut.get() as usize + 1);

        for bucket in 0..=cut.get() {
            let run = self.morton.run(depth_of(bucket), cell);
            runs.push(narrow(run.end - run.start));
            ranges.push(narrow(run.start)..narrow(run.end));
        }

        (0, runs, ranges)
    }

    /// Counts the points of `cell` across every occupied bucket.
    ///
    /// The subtree count of a cell without a quad node.
    fn population(&self, cell: MortonCell) -> u64 {
        let lengths = self.morton.fenceposts().lengths();

        let mut population = 0;
        for depth in 0..=Depth::MAX.get() {
            if lengths[depth as usize] == 0 {
                continue;
            }

            let run = self.morton.run(depth_of(depth), cell);
            population += run.end - run.start;
        }

        population
    }

    /// Returns the deepest occupied bucket, zero when no point exists.
    fn deepest_occupied(&self) -> u64 {
        self.morton
            .fenceposts()
            .lengths()
            .iter()
            .rposition(|&length| length > 0)
            .map_or(0, |bucket| bucket as u64)
    }
}

/// Assembles a non-root delta delivery.
///
/// The node's own-bucket run verbatim, one zero-length run when the cell has no node.
#[expect(
    clippy::single_range_in_vec_init,
    reason = "an array of one range is what a delta delivery IS"
)]
fn delta(cut: Depth, node: Option<&Node>) -> (u8, Vec<u32>, Vec<Range<u32>>) {
    node.map_or_else(
        || (cut.get(), vec![0], Vec::new()),
        |node| {
            let run = node.run();
            (
                cut.get(),
                vec![narrow(run.end - run.start)],
                vec![narrow(run.start)..narrow(run.end)],
            )
        },
    )
}

/// Reads the occupied-child bitmask off a node record.
///
/// Bit `i` set when Morton child `i` holds a point below the node's cut, which by the
/// node-existence rule is exactly when the child node exists.
fn occupied_children(node: &Node) -> u8 {
    (0..4).fold(0_u8, |bits, quadrant| {
        bits | (u8::from(node.child(quadrant).is_some()) << quadrant)
    })
}
