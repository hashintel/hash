//! Tile delivery: one `z/x/y` request answered with `SALTILET`
//! envelope bytes, in delta or total mode, with the `TYPE_MASK`
//! column riding requests that color types.

use core::{error::Error, fmt, ops::Range};

use super::{
    Atlas, Filter, Mode, TileCoordinate, cell_of,
    color::MaskSet,
    depth_of,
    detail::{DeliveredEntities, NodeDetails},
    narrow,
};
use crate::{
    file::quad::Node,
    morton::{Depth, MortonCell},
    salt::wire::tile::{GlobalHead, TileHead, TileResponse, TileTrailer},
};

/// The tile endpoint's request caps.
///
/// Transport configuration with documented defaults, never wire
/// constants: the transport constructs one value and the manifest
/// publishes the same value, so enforcement and advertisement
/// cannot disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TileCaps {
    /// Most `coloredTypeIds` entries one request may carry; the
    /// manifest publishes this value as `limits.coloredTypeIds`.
    /// Defaults to 32 - at that ceiling the `TYPE_MASK` stride is
    /// four bytes per point.
    pub colored_type_ids: u32,
}

const impl Default for TileCaps {
    fn default() -> Self {
        Self {
            colored_type_ids: 32,
        }
    }
}

/// A tile request was rejected.
///
/// Every variant is a named, data-carrying rejection for the transport
/// layer to map onto its error vocabulary; none of them can result
/// from a well-formed request against the serving contract's limits,
/// which the manifest publishes as data.
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
    /// The request names a feature this build does not serve; the
    /// carried name is the request field.
    Unsupported(&'static str),
}

impl fmt::Display for TileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Types { count, maximum } => {
                write!(
                    formatter,
                    "the request carries {count} colored type ids where the cap admits {maximum}"
                )
            }
            Self::Depth { z, maximum } => {
                write!(
                    formatter,
                    "zoom {z} exceeds the deepest served tile {maximum}"
                )
            }
            Self::Grid { z, x, y } => {
                write!(formatter, "({x}, {y}) lies outside the 2^{z} tile grid")
            }
            Self::Unsupported(feature) => {
                write!(formatter, "this build does not serve {feature} requests")
            }
        }
    }
}

impl Error for TileError {}

/// The query context of one tile request: the ratified POST body,
/// every field optional.
#[derive(Debug, Clone, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TileQuery {
    /// The delivery mode; delta when the request names none.
    #[serde(default)]
    pub mode: Mode,
    /// Versioned type ids conditioning the `TYPE_MASK` column, in
    /// request order.
    #[serde(default)]
    pub colored_type_ids: Vec<String>,
    /// The visibility filter; absent means the trivial bitmap.
    #[serde(default)]
    pub filter: Option<Filter>,
    /// Whether the detail trailer rides the response.
    #[serde(default)]
    pub include_detailed_data: bool,
}

/// One tile read: the route's coordinate plus the body's query
/// context, joined by the transport layer.
#[derive(Debug, Clone)]
pub struct TileRequest {
    /// The tile address from the route.
    pub coordinate: TileCoordinate,
    /// The query context from the request body.
    pub query: TileQuery,
}

/// One assembled tile: everything [`Atlas::encode_tile`] needs
/// except the columns it gathers at encode time.
///
/// The document owns its derived data, so it crosses thread
/// boundaries between assembly, hydration, and encoding - the
/// envelope was designed for hydration-last, and the split mirrors
/// it: assembly and encoding are CPU-bound, hydration awaits the
/// store between them.
#[derive(Debug)]
pub struct TileDocument {
    coordinate: TileCoordinate,
    mode: Mode,
    visible: u64,
    first_bucket: u8,
    runs: Vec<u32>,
    ranges: Vec<Range<u32>>,
    children: u8,
    global: Option<GlobalHead>,
    mask_set: Option<MaskSet>,
}

impl Atlas {
    /// Answers one tile request without the detail trailer:
    /// `SALTILET` envelope bytes, ready to send under
    /// `application/vnd.hash.saltile-v1`.
    ///
    /// A request that sets `includeDetailedData` is rejected by
    /// name: this path serves deployments without a store
    /// connection. A transport with one assembles, hydrates, and
    /// encodes through [`Atlas::assemble_tile`],
    /// [`Atlas::delivered_entities`], and [`Atlas::encode_tile`].
    ///
    /// # Errors
    ///
    /// As [`Atlas::assemble_tile`], plus
    /// [`TileError::Unsupported`] when the query sets
    /// `includeDetailedData`.
    pub fn tile(&self, request: &TileRequest, caps: TileCaps) -> Result<Vec<u8>, TileError> {
        if request.query.include_detailed_data {
            return Err(TileError::Unsupported("includeDetailedData"));
        }

        let document = self.assemble_tile(request, caps)?;
        Ok(self.encode_tile(&document, None))
    }

    /// Assembles one tile request into its owned document: every
    /// rejection happens here, so encoding cannot fail.
    ///
    /// The `TYPE_MASK` column rides exactly the requests that supply
    /// `coloredTypeIds`: bit `i` of a point's mask reads 1 when the
    /// point carries the request's type `i` or one of its
    /// descendants. An id that resolves to no type in this
    /// generation is legal and reads 0 in every mask.
    ///
    /// Version 0 serves the full unfiltered visible set in both
    /// modes; a request naming a filter is rejected by name rather
    /// than answered with bytes that silently ignore it.
    ///
    /// # Errors
    ///
    /// Returns [`TileError::Types`] when the request carries more
    /// `coloredTypeIds` than `caps.colored_type_ids`,
    /// [`TileError::Depth`] when the zoom exceeds the generation's
    /// deepest served tile, [`TileError::Grid`] when the coordinate
    /// lies outside the zoom's grid, and [`TileError::Unsupported`]
    /// when the query names a version-0 deferral.
    pub fn assemble_tile(
        &self,
        request: &TileRequest,
        caps: TileCaps,
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

        // The zoom's cut: buckets at or below z + span_log2 are
        // delivered by zoom z's cumulative schedule, and the tile's
        // own bucket is the cut itself. Bounded by the deepest grid,
        // which open validated against the key width.
        let cut = depth_of(coordinate.z + self.lod.span_log2);

        let node = self.node_of(cell);
        let (first_bucket, runs, ranges) = match (request.query.mode, coordinate.z) {
            (Mode::Delta, 0) => self.root_delta(cut),
            (Mode::Delta, _) => delta(cut, node),
            (Mode::Total, _) => self.total(cut, cell),
        };

        let children = node.map_or(0, occupied_children);
        let visible = match node {
            _ if coordinate.z == 0 => self.morton.count(),
            Some(node) => u64::from(node.points()),
            None => self.population(cell),
        };
        let global = (coordinate.z == 0).then(|| GlobalHead {
            visible: self.morton.fenceposts().segment(cut).end,
            bounds: self.bounds,
            min_resolution: self.deepest_occupied(),
        });

        let mask_set = (!request.query.colored_type_ids.is_empty())
            .then(|| self.resolve_masks(&request.query.colored_type_ids));

        Ok(TileDocument {
            coordinate,
            mode: request.query.mode,
            visible,
            first_bucket,
            runs,
            ranges,
            children,
            global,
            mask_set,
        })
    }

    /// Gathers the entity identities behind the document's delivered
    /// set, in delivered order: the hydration request's subject.
    ///
    /// # Panics
    ///
    /// Panics when the identity table contradicts the row column,
    /// which open's cross-artifact validation rules out.
    #[must_use]
    pub fn delivered_entities(&self, document: &TileDocument) -> DeliveredEntities {
        let row_ids = self.row_ids();
        let count = document.ranges.iter().map(Range::len).sum();
        let mut ids = Vec::with_capacity(count);
        for range in &document.ranges {
            for &row in &row_ids[range.start as usize..range.end as usize] {
                ids.push(
                    self.node_ids
                        .id(u64::from(row))
                        .expect("open validated the identity rows against the code column"),
                );
            }
        }

        DeliveredEntities::new(ids)
    }

    /// Encodes an assembled document: `SALTILET` envelope bytes,
    /// ready to send under `application/vnd.hash.saltile-v1`, with
    /// the detail trailer riding iff `details` is supplied.
    ///
    /// # Panics
    ///
    /// Panics when supplied details do not cover the document's
    /// delivered points - a transport bug, never request data.
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
            ranges: &document.ranges,
            positions: self.positions(),
            rows: self.wire_rows(),
            masks: masks.as_deref(),
            trailer,
        };

        response.encode()
    }

    /// Returns the quad node owning `cell`, [`None`] when the schedule
    /// delivers nothing new at or below it.
    fn node_of(&self, cell: MortonCell) -> Option<&Node> {
        let index = self.quad.locate(cell)?;
        Some(&self.quad.nodes()[index as usize])
    }

    /// Assembles the zoom-0 delta delivery: buckets `0..=m` as
    /// fencepost differences, one contiguous base-order range.
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

    /// Assembles a total delivery: one code-column run per bucket of
    /// the cumulative schedule, bucket-major.
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

    /// Counts the points of `cell` across every occupied bucket: the
    /// subtree count of a cell without a quad node.
    fn population(&self, cell: MortonCell) -> u64 {
        let lengths = self.morton.fenceposts().lengths();
        (0..=Depth::MAX.get())
            .filter(|&bucket| lengths[bucket as usize] > 0)
            .map(|bucket| {
                let run = self.morton.run(depth_of(bucket), cell);
                run.end - run.start
            })
            .sum()
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

/// Assembles a non-root delta delivery: the node's own-bucket run
/// verbatim, one zero-length run when the cell has no node.
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

/// Reads the occupied-child bitmask off a node record: bit `i` set
/// when Morton child `i` holds a point below the node's cut, which by
/// the node-existence rule is exactly when the child node exists.
fn occupied_children(node: &Node) -> u8 {
    (0..4).fold(0_u8, |bits, quadrant| {
        bits | (u8::from(node.child(quadrant).is_some()) << quadrant)
    })
}
