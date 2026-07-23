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
    children: u8,
    global: Option<GlobalHead>,
    mask_set: Option<MaskSet>,
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

        let (delivered, runs) = if proof.is_full() {
            (DeliveredPoints::Ranges(ranges), runs)
        } else {
            self.gather_visible(&ranges, proof)
        };

        let children = if proof.is_full() {
            node.map_or(0, occupied_children)
        } else {
            node.map_or(0, |node| self.visible_children(node, proof))
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
            children,
            global,
            mask_set,
        })
    }

    /// Gathers the visible positions of each delivery range.
    ///
    /// With the per-bucket runs recounted over the survivors.
    fn gather_visible(
        &self,
        ranges: &[Range<u32>],
        proof: &VisibilityProof,
    ) -> (DeliveredPoints, Vec<u32>) {
        // NOTE: doesn't this have the problem that we may deliver no points at all? even if points
        // have been requested because the upper layer doesn't have them? if that's a case that's a
        // major violation of what we're trying to do here. We pull up as much as possible, until we
        // have reached the upper delivery limit. That way someone is never presented with an empty
        // tile, even if at the current z level nothing is there.
        // I guess the other parts do that in the function, if that is the case, I would like some
        // additional comments/clarifications on this and the relationships between the functions,
        // right now it is all very opaque.
        let row_ids = self.row_ids();
        let mut gathered = Vec::new();
        let mut runs = Vec::with_capacity(ranges.len());

        for range in ranges {
            let before = gathered.len();
            for position in range.clone() {
                if proof.contains(row_ids[position as usize]) {
                    gathered.push(position);
                }
            }

            runs.push(narrow((gathered.len() - before) as u64));
        }

        (DeliveredPoints::Positions(gathered), runs)
    }

    /// Reads the occupied-child bitmask over the masked view.
    ///
    /// Bit `i` set when Morton child `i` holds a visible point below this zoom's cut.
    ///
    /// The walk descends each child's quad subtree and scans every node's own-bucket run until a
    /// visible row surfaces, so a child whose subtree the mask empties reads unoccupied - the
    /// client never fetches a tile the mask made empty, and the bitmask carries no evidence that
    /// hidden points exist.
    fn visible_children(&self, node: &Node, proof: &VisibilityProof) -> u8 {
        let mut bits = 0_u8;

        for (index, quadrant) in node.children().iter().enumerate() {
            let &Some(child) = quadrant else { continue };
            let occupied = self.subtree_has_visible(child, proof);

            bits |= u8::from(occupied) << index;
        }

        bits
    }

    /// Returns whether any node in the quad subtree rooted at `index` delivers a visible row.
    fn subtree_has_visible(&self, index: u32, proof: &VisibilityProof) -> bool {
        let row_ids = self.row_ids();
        let nodes = self.quad.nodes();

        let mut stack = vec![index];
        while let Some(index) = stack.pop() {
            let node = &nodes[index as usize];
            for position in node.run() {
                let position = usize::try_from(position).expect("base positions fit usize");
                if proof.contains(row_ids[position]) {
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
