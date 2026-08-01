//! Tile delivery.
//!
//! One `z/x/y` request answered with `SALTILET` envelope bytes, in delta or total mode, with the
//! `TYPE_MASK` column riding requests that colour types.

use core::{error::Error, fmt};

use type_system::ontology::id::VersionedUrl;

use super::{
    Atlas, Filter, Mode, TileCoordinate,
    colour::{MaskSet, Palette},
    density::{CutOffset, ViewOccupancy},
    grid,
    hydrate::{DeliveredEntities, NodeDetails},
    schedule::{ScheduleWidthError, ViewSchedule},
    visibility::VisibilityProof,
    walk::{DeliveredPoints, ViewCensus, Walk, occupied_children},
};
use crate::salt::wire::tile::{GlobalHead, TileHead, TileResponse, TileTrailer};

/// The tile endpoint's request limits.
///
/// Transport configuration with documented defaults, never wire constants: the transport constructs
/// one value and the manifest publishes the same value, so enforcement and advertisement cannot
/// disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TileLimits {
    /// Most `coloredTypeIds` entries one request may carry.
    ///
    /// The manifest publishes this value as `limits.coloredTypeIds`. The cap bounds the
    /// `TYPE_MASK` stride, which carries one bit per requested type: at 32 that is four bytes per
    /// point.
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
    /// The resolved cut offset lies past the key width.
    ///
    /// This same generation's schedule resolves a sealed offset, so the value is a defect to
    /// surface. Delivery refuses it whole rather than clamping or substituting a schedule.
    Schedule(ScheduleWidthError),
    /// The proof and the schedule it travelled with disagree about the serving contract.
    ///
    /// Each proof constructor pairs with exactly one [`ViewSchedule`] variant; a mismatched pair
    /// is a transport defect, and delivery refuses it rather than serving either contract.
    Contract,
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
            Self::Schedule(error) => error.fmt(fmt),
            Self::Contract => {
                write!(
                    fmt,
                    "the visibility proof and its delivery schedule disagree about the serving \
                     contract"
                )
            }
        }
    }
}

impl Error for TileError {}

/// The query context of one tile request: the ratified POST body, every field optional.
#[derive(Debug, Clone, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TileQuery {
    /// The delivery mode, defaulting to delta when the request names none.
    #[serde(default)]
    pub mode: Mode,
    /// Versioned type URLs conditioning the `TYPE_MASK` column, in request order.
    ///
    /// Entries parse at the transport boundary: a malformed URL rejects the body, while a
    /// well-formed URL this generation never ingested is legal and reads zero bits.
    #[serde(default)]
    #[schemars(with = "Vec<String>")]
    pub colored_type_ids: Vec<VersionedUrl>,
    /// The visibility filter, a reserved field.
    ///
    /// Delivery rejects any request that carries one.
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
/// and encoding. The envelope orders hydration last, and the split mirrors that order: assembly and
/// encoding are CPU-bound, hydration awaits the store between them.
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

impl Atlas {
    /// Answers one tile request without the detail trailer.
    ///
    /// `SALTILET` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`.
    ///
    /// This path rejects a request that sets `includeDetailedData` by name, because it serves
    /// deployments without a store connection. A transport with one assembles, hydrates, and
    /// encodes through [`Atlas::assemble_tile`], [`Atlas::delivered_entities`], and
    /// [`Atlas::encode_tile`].
    ///
    /// This path censuses `proof` and derives its schedule itself, once per call. A transport
    /// resolves both with the scope and hands them to [`Atlas::assemble_tile`], so the scope pays
    /// for the walks rather than the request. Without a store, the deployment holds no scope for
    /// them and nothing remains to amortize against.
    ///
    /// # Errors
    ///
    /// As [`Atlas::assemble_tile`], plus [`TileError::Unsupported`] when the query sets
    /// `includeDetailedData`.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    pub fn tile(
        &self,
        request: &TileRequest,
        limits: TileLimits,
        proof: &VisibilityProof,
        k: CutOffset,
    ) -> Result<Vec<u8>, TileError> {
        if request.query.include_detailed_data {
            return Err(TileError::Unsupported("includeDetailedData"));
        }

        let schedule = ViewSchedule::of(self, proof);
        let document =
            self.assemble_tile(request, limits, proof, self.census(proof), &schedule, k)?;
        Ok(self.encode_tile(&document, None))
    }

    /// Censuses the visible view `proof` admits over this generation.
    ///
    /// A root tile publishes corpus-wide aggregates, resolved once per scope. An unmasked proof
    /// answers from the artifacts, and a masked one costs one pass over the base column. Every
    /// root-tile request under a scope then reads the census rather than recomputing it, which
    /// keeps the walk off the request path.
    ///
    /// The caller must pass the census taken from this same proof. Assembly reads it as the view's
    /// own aggregates without re-deriving them, so a census paired with a different proof publishes
    /// that other scope's extent. Pinning a proof to its own generation carries the same contract
    /// for the same reason.
    #[must_use]
    pub fn census(&self, proof: &VisibilityProof) -> ViewCensus {
        Walk::of(self, proof).visible_census(self.grid.cut(0), self.positions(), self.bounds)
    }

    /// Aggregates the Morton occupancy of `proof`'s visible view.
    ///
    /// The delivery-cut policy takes this aggregate as its input. Producing it costs one pass over
    /// the code column, and only a fresh bootstrap that resolves its offset pays that pass. The
    /// request path never does.
    #[must_use]
    pub(crate) fn visible_occupancy(&self, proof: &VisibilityProof) -> ViewOccupancy {
        Walk::of(self, proof).visible_occupancy()
    }

    /// Assembles one tile request into its owned document.
    ///
    /// Every rejection happens here, so encoding cannot fail.
    ///
    /// Exactly the requests that supply `coloredTypeIds` carry the `TYPE_MASK` column. Bit `i` of a
    /// point's mask reads 1 when the point carries the request's type `i` or one of its
    /// descendants. An id that resolves to no type in this generation is legal and reads 0 in every
    /// mask.
    ///
    /// An operator proof delivers the generation's corpus schedule. Under a scoped proof, delivery
    /// instead follows the view's resolved cut `z + span + k`, which gives one contiguous interval
    /// of scope buckets per response, ascending bucket then Morton order, with every
    /// schedule-derived `HEAD` field (`visible` counts, the `children` bitmask, the root's global
    /// metadata) reduced over the visible view alone. A hidden point contributes to none of them,
    /// so a scope's tile carries no evidence of what the mask removed: a fully masked tile is a
    /// tile that never had rows.
    ///
    /// Version 0 serves the full unfiltered visible set in both modes. Delivery rejects a request
    /// naming a filter by name rather than answering with bytes that ignore it without saying so.
    ///
    /// # Errors
    ///
    /// Returns [`TileError::Types`] when the request carries more `coloredTypeIds` than
    /// `limits.colored_type_ids`, [`TileError::Depth`] when the zoom exceeds the generation's
    /// deepest served tile, [`TileError::Grid`] when the coordinate lies outside the zoom's
    /// grid, [`TileError::Unsupported`] when the query names a version-0 deferral,
    /// [`TileError::Schedule`] when the resolved cut lies past the key width, and
    /// [`TileError::Contract`] when `proof` and `schedule` pair the wrong variants.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    pub fn assemble_tile(
        &self,
        request: &TileRequest,
        limits: TileLimits,
        proof: &VisibilityProof,
        census: ViewCensus,
        schedule: &ViewSchedule,
        k: CutOffset,
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

        // This match discriminates the contract. Each proof constructor pairs with exactly one
        // schedule variant, and a mismatched pair refuses before any bytes assemble.
        let scope_cut = match (proof.is_full(), schedule) {
            (true, ViewSchedule::Corpus) => None,
            (false, ViewSchedule::Scope(scope)) => {
                Some(scope.cut(self.grid, k).map_err(TileError::Schedule)?)
            }
            (true, ViewSchedule::Scope(_)) | (false, ViewSchedule::Corpus) => {
                return Err(TileError::Contract);
            }
        };

        let walk = Walk::of(self, proof);
        let node = walk.node_of(cell);
        #[expect(
            clippy::option_if_let_else,
            reason = "both arms borrow `walk` and `node`, which `map_or_else` closures cannot \
                      share"
        )]
        let (delivered, first_bucket, runs, children) = if let Some(cut) = scope_cut {
            let delivery = match request.query.mode {
                Mode::Delta => cut.delta(coordinate.z, cell),
                Mode::Total => cut.total(coordinate.z, cell),
            };
            let children = cut.children(coordinate.z, cell);

            (
                DeliveredPoints::Positions(delivery.positions),
                delivery.first_bucket,
                delivery.runs,
                children,
            )
        } else {
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

        // The root publishes the view's own aggregates. The scope resolved the extent once, and the
        // count and resolution are the schedule's, so a scoped root names its own cascade rather
        // than the corpus one.
        let global = (coordinate.z == 0).then(|| {
            scope_cut.map_or_else(
                || GlobalHead {
                    visible: census.visible(),
                    bounds: census.bounds(),
                    min_resolution: census.min_resolution(),
                },
                |cut| GlobalHead {
                    visible: cut.root_delivered(),
                    bounds: census.bounds(),
                    min_resolution: cut.min_resolution(),
                },
            )
        });

        let palette = Palette::of(&request.query.colored_type_ids);
        let mask_set = (!palette.is_empty()).then(|| self.resolve_masks(&palette));

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

    /// Gathers the entity identities behind the document's delivered set, in delivered order.
    ///
    /// The hydration request's subject.
    ///
    /// # Panics
    ///
    /// This panics when the identity table contradicts the row column, which open's cross-artifact
    /// validation rules out.
    #[must_use]
    pub fn delivered_entities(&self, document: &TileDocument) -> DeliveredEntities {
        let row_ids = self.row_ids();
        let ids = document
            .delivered
            .iter()
            .map(|position| {
                let row = row_ids[position];
                self.node_ids
                    .id(row)
                    .expect("open validated the identity rows against the code column")
            })
            .collect();

        DeliveredEntities::new(ids)
    }

    /// Encodes an assembled document.
    ///
    /// `SALTILET` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`, with the
    /// detail trailer included iff the caller supplies `details`.
    ///
    /// # Panics
    ///
    /// This panics when supplied details do not cover the document's delivered points, a transport
    /// bug rather than request data.
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
}
