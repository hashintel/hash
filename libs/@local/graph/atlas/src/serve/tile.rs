//! Tile delivery.
//!
//! One `z/x/y` request answered with `SALTILET` envelope bytes, in delta or total mode, with the
//! `TYPE_MASK` column riding requests that colour types.

use core::{error::Error, fmt};

use hashql_core::id::Id as _;
use type_system::ontology::id::VersionedUrl;

use super::{
    Atlas, Filter, Mode, TileCoordinate,
    colour::{MaskSet, Palette},
    grid,
    hydrate::{DeliveredEntities, NodeDetails},
    visibility::VisibilityProof,
    walk::{DeliveredPoints, Walk, occupied_children},
};
use crate::{
    identity::NodeRowId,
    morton::Depth,
    salt::wire::tile::{GlobalHead, TileHead, TileResponse, TileTrailer},
};

/// The tile endpoint's request limits.
///
/// Transport configuration with documented defaults, never wire constants: the transport constructs
/// one value and the manifest publishes the same value, so enforcement and advertisement cannot
/// disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TileLimits {
    /// Most `coloredTypeIds` entries one request may carry.
    ///
    /// The manifest publishes this value as `limits.coloredTypeIds`. Defaults to 32 - at that
    /// ceiling the `TYPE_MASK` stride is four bytes per point.
    pub colored_type_ids: u32 = 32,
}

const impl Default for TileLimits {
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
                    "the request carries {count} coloredTypeIds where the cap admits {maximum}"
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
    /// Versioned type URLs conditioning the `TYPE_MASK` column, in request order.
    ///
    /// Entries parse at the transport boundary: a malformed URL rejects the body, while a
    /// well-formed URL this generation never ingested is legal and reads zero bits.
    #[serde(default)]
    #[schemars(with = "Vec<String>")]
    pub colored_type_ids: Vec<VersionedUrl>,
    /// The visibility filter, a reserved field: a request that carries one is rejected.
    #[serde(default)]
    pub filter: Option<Filter>,
    /// Whether the response carries the detail trailer.
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
        limits: TileLimits,
        proof: &VisibilityProof,
    ) -> Result<Vec<u8>, TileError> {
        if request.query.include_detailed_data {
            return Err(TileError::Unsupported("includeDetailedData"));
        }

        let document = self.assemble_tile(request, limits, proof)?;
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
    /// `limits.colored_type_ids`, [`TileError::Depth`] when the zoom exceeds the generation's
    /// deepest served tile, [`TileError::Grid`] when the coordinate lies outside the zoom's
    /// grid, and [`TileError::Unsupported`] when the query names a version-0 deferral.
    pub fn assemble_tile(
        &self,
        request: &TileRequest,
        limits: TileLimits,
        proof: &VisibilityProof,
    ) -> Result<TileDocument, TileError> {
        if request.query.filter.is_some() {
            return Err(TileError::Unsupported("filter"));
        }

        if request.query.colored_type_ids.len() > limits.colored_type_ids as usize {
            return Err(TileError::Types {
                count: request.query.colored_type_ids.len(),
                maximum: limits.colored_type_ids,
            });
        }

        let coordinate = request.coordinate;
        let maximum = self.grid.max_tile_depth();
        if coordinate.z > maximum {
            return Err(TileError::Depth {
                z: coordinate.z,
                maximum,
            });
        }

        let cell = grid::cell_of(coordinate).ok_or(TileError::Grid {
            z: coordinate.z,
            x: coordinate.x,
            y: coordinate.y,
        })?;

        let walk = Walk::of(self, proof);
        let node = walk.node_of(cell);
        let (delivered, first_bucket, runs, backfilled, children) = if proof.is_full() {
            let full = match (request.query.mode, coordinate.z) {
                (Mode::Delta, 0) => walk.root_delta(),
                (Mode::Delta, _) => walk.delta(coordinate.z, node),
                (Mode::Total, _) => walk.total(coordinate.z, cell),
            };
            let children = node.map_or(0, occupied_children);
            (
                DeliveredPoints::Ranges(full.ranges),
                full.first_bucket,
                full.runs,
                0,
                children,
            )
        } else {
            let masked = walk.gather_masked(coordinate, request.query.mode);
            let children = if masked.dry {
                // The subtree's visible points are all delivered; nothing below says descend.
                0
            } else {
                node.map_or(0, |node| walk.visible_children(node, &masked.taken))
            };
            (
                masked.delivered,
                masked.first_bucket,
                masked.runs,
                masked.backfilled,
                children,
            )
        };

        let visible = if coordinate.z == 0 {
            proof.visible_below(self.morton.count())
        } else if proof.is_full() {
            node.map_or_else(|| walk.population(cell), |node| u64::from(node.points()))
        } else {
            walk.visible_population(cell)
        };

        let global = (coordinate.z == 0)
            .then(|| self.global_head(&walk, self.grid.cut(coordinate.z), proof));

        let palette = Palette::of(&request.query.colored_type_ids);
        let mask_set = (!palette.is_empty()).then(|| self.resolve_masks(&palette));

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

    /// Assembles the root's global metadata over the masked view.
    ///
    /// The visible delivered count, the tight extent of the visible set, and its deepest occupied
    /// bucket.
    fn global_head(&self, walk: &Walk<'_>, cut: Depth, proof: &VisibilityProof) -> GlobalHead {
        if proof.is_full() {
            return GlobalHead {
                visible: self.morton.fenceposts().segment(cut).end,
                bounds: self.bounds,
                min_resolution: walk.deepest_occupied(),
            };
        }

        GlobalHead {
            visible: walk.visible_at(cut),
            bounds: walk.visible_extent(self.positions()),
            min_resolution: walk.visible_deepest(),
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
        let ids = document
            .delivered
            .iter()
            .map(|position| {
                let row = row_ids[position as usize];
                self.node_ids
                    .id(NodeRowId::from_u32(row))
                    .expect("open validated the identity rows against the code column")
            })
            .collect();

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
}
