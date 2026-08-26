//! Tile delivery.
//!
//! One `z/x/y` request answered with `SALTILET` envelope bytes, in delta or total mode, with the
//! `TYPE_MASK` column riding requests that colour types.

use core::{error::Error, fmt};

use hashql_core::id::{Id as _, IdSlice};
use type_system::ontology::id::VersionedUrl;

use super::{
    Atlas,
    colour::{MaskSet, Palette},
    density::ViewOccupancy,
    grid,
    hydrate::NodeDetails,
    schedule::{ArrivalIndex, ArrivalRow, ViewRow},
    view::{View, ViewError},
    visibility::VisibilityProof,
    walk::{
        DeliveredPoints, ViewCensus, Walk, full::occupied_children, subtract::subtract_withdrawn,
    },
};
use crate::{
    dataset::auxiliary::{Icon, Label, Legend},
    file::quad::Node,
    morton::MortonCell,
    salt::{
        postings::closure::IconSource,
        wire::{
            Mode,
            tile::{GlobalHead, TileCoordinate, TileHead, TileResponse, TileTrailer},
        },
    },
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
pub(crate) enum TileError {
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
    /// The delivery view did not bind.
    ///
    /// A binding refusal converts into this variant through [`From`], so one error union carries a
    /// route's binding and assembly rejections together. [`Atlas::tile`] takes the view already
    /// bound, so its own rejections are all request-shaped.
    View(ViewError),
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
            Self::View(error) => error.fmt(fmt),
        }
    }
}

impl Error for TileError {}

impl From<ViewError> for TileError {
    fn from(value: ViewError) -> Self {
        Self::View(value)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum TileDetail {
    #[default]
    Minimal,
    Auxiliary,
}

/// The query context of one tile request: the ratified POST body, every field optional.
#[derive(Debug, Clone, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TileQuery {
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
    /// Whether the response carries the detail trailer.
    #[serde(default)]
    pub detail: TileDetail,
}

/// One tile read.
///
/// The route's coordinate plus the body's query context, joined by the transport layer.
#[derive(Debug, Clone)]
pub(crate) struct TileRequest {
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
struct TileDocument {
    coordinate: TileCoordinate,
    mode: Mode,
    first_bucket: u8,
    runs: Vec<u32>,
    delivered: DeliveredPoints,
    children: u8,
    global: Option<GlobalHead>,
    mask_set: Option<MaskSet>,
}

impl Atlas {
    /// Answers one tile request over its bound delivery view.
    ///
    /// `SALTILET` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`. A
    /// request asking for the detail trailer resolves per-point labels and icons in process,
    /// captured display first and the generation's own payloads second, so every section of
    /// the envelope assembles from the opened artifacts and the view's own cohort alone.
    ///
    /// # Errors
    ///
    /// As [`Atlas::assemble_tile`].
    pub(crate) fn tile(
        &self,
        request: &TileRequest,
        limits: TileLimits,
        view: View<'_>,
    ) -> Result<Vec<u8>, TileError> {
        let document = self.assemble_tile(request, limits, &view)?;

        let arrivals = view.arrivals();

        let details = match request.query.detail {
            TileDetail::Minimal => None,
            TileDetail::Auxiliary => {
                let mut labels = Vec::with_capacity(document.delivered.count());
                let mut icons = Vec::with_capacity(document.delivered.count());

                // Hoisted once per response: a captureless cohort answers no overlay read,
                // so the per-row identity lookup below runs only when a capture could answer
                // it, and a base tile under no cohort keeps its pre-overlay path exactly.
                let cohort = view.cohort();
                let overlaid = cohort.captures_any();

                for row in document.delivered.iter() {
                    match row {
                        ViewRow::Base(position) => {
                            let row = self.rows.view()[position];
                            // Captured display first, generation payload second (the
                            // register's own precedence), so a revised fitted identity serves
                            // its freshest label.
                            let label = if overlaid {
                                self.node_ids.id(row).and_then(|id| cohort.legend_of(id))
                            } else {
                                None
                            }
                            .map_or_else(
                                || {
                                    self.node_ids
                                        .payload_of(row)
                                        .map_or(Label::EMPTY, |legend| legend.label())
                                },
                                Legend::label,
                            );

                            labels.push(label);

                            if let Some(types) = self.postings.direct_types(position)
                                && let Some((_, icon, _)) = types
                                    .iter()
                                    .enumerate()
                                    .filter_map(|(index, &r#type)| {
                                        let IconSource { source, depth } =
                                            self.closure.icon_source(r#type)?;

                                        self.ontology_ids
                                            .payload_of(source)
                                            .map(|icon| (index, icon, depth))
                                    })
                                    .min_by_key(|&(index, _, depth)| (depth, index))
                            {
                                icons.push(icon);
                            } else {
                                icons.push(Icon::empty());
                            }
                        }
                        ViewRow::Arrival(index) => {
                            let arrival = &arrivals[index];
                            let legend: &Legend = arrival.legend.as_ref();
                            labels.push(legend.label());

                            // The legend names its representative as an ontology row. The
                            // baked closure artifact resolves the generation's own types, and
                            // a row past its domain is an allocated one, whose icon the
                            // cohort's snapshot recorded at allocation.
                            let representative = legend.representative_ontology();
                            let icon = if representative.as_usize() < self.closure.types() {
                                self.closure
                                    .icon_source(representative)
                                    .and_then(|IconSource { source, .. }| {
                                        self.ontology_ids.payload_of(source)
                                    })
                                    .unwrap_or(Icon::empty())
                            } else {
                                cohort.allocated_icon_of(representative).expect(
                                    "the arrival table and the cohort derive from one snapshot, \
                                     which recorded an icon at every row it allocated",
                                )
                            };
                            icons.push(icon);
                        }
                    }
                }

                Some(NodeDetails::new(labels, icons))
            }
        };

        Ok(self.encode_tile(&document, arrivals, details.as_ref()))
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
    pub(crate) fn census(&self, proof: &VisibilityProof) -> ViewCensus {
        Walk::of(self, proof).visible_census(self.grid.cut(0), self.positions(), self.bounds)
    }

    /// Aggregates the Morton occupancy the delivery-cut policy reads for `proof`.
    ///
    /// Producing it costs one pass over the code column and an allocation for the visible keys,
    /// so a scoped resolution takes it once rather than paying the pass per request.
    /// [`VisibilityProof::kind`] is the cheap question a caller asks first. A deployment
    /// without a density policy still pays this pass per scoped resolution and then reads
    /// nothing from it, a cost accepted for one resolution path rather than two.
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
    /// An operator view delivers the generation's corpus schedule. Under a scoped view, delivery
    /// instead follows the bound cut `z + span + k`, which gives one contiguous interval
    /// of scope buckets per response, ascending bucket then Morton order, with every
    /// schedule-derived `HEAD` field (`visible` counts, the `children` bitmask, the root's global
    /// metadata) reduced over the visible view alone. A hidden point contributes to none of them,
    /// so a scope's tile carries no evidence of what the mask removed: a fully masked tile is a
    /// tile that never had rows.
    ///
    /// The view's admitted arrivals join both delivery laws at their own first-occupant
    /// buckets. A bound cut merges them from its overlay or its own slots, and the operator
    /// delivery splices them into its ranges. Every `HEAD` field folds them in the same way.
    ///
    /// Version 0 serves the full unfiltered visible set in both modes. The body vocabulary admits
    /// no visibility filter, so a request naming one rejects as `invalid-body` rather than
    /// receiving bytes that ignore it without saying so.
    ///
    /// # Errors
    ///
    /// Returns [`TileError::Types`] when the request carries more `coloredTypeIds` than
    /// `limits.colored_type_ids`, [`TileError::Depth`] when the zoom exceeds the generation's
    /// deepest served tile, and [`TileError::Grid`] when the coordinate lies outside the zoom's
    /// grid. The delivery contract is `view`'s, checked when it bound, so no rejection here is
    /// about it.
    fn assemble_tile(
        &self,
        request: &TileRequest,
        limits: TileLimits,
        view: &View<'_>,
    ) -> Result<TileDocument, TileError> {
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

        // The bound cut is the whole contract discriminant: present exactly under a scoped view,
        // which is what binding proved when it paired the proof with its schedule.
        let scope_cut = view.cut();
        let proof = view.proof();
        let census = view.census();

        let walk = Walk::of(self, proof);
        // Every consumer of `node` sits on the operator path (`is_full` is `cut.is_none()`), so a
        // scoped tile skips the quadtree lookup.
        let node = if scope_cut.is_none() {
            walk.node_of(cell)
        } else {
            None
        };

        #[expect(
            clippy::option_if_let_else,
            reason = "both arms borrow `walk` and `node`, which `map_or_else` closures cannot \
                      share"
        )]
        let (mut delivered, first_bucket, mut runs, children) = if let Some(cut) = scope_cut {
            let delivery = match request.query.mode {
                Mode::Delta => cut.delta(coordinate.z, cell),
                Mode::Total => cut.total(coordinate.z, cell),
            };
            let children = cut.children(coordinate.z, cell);

            (
                DeliveredPoints::Positions(delivery.rows),
                delivery.first_bucket,
                delivery.runs,
                children,
            )
        } else {
            self.corpus_delivery(&walk, view, request.query.mode, coordinate.z, cell, node)
        };

        // Admission subtraction: the ingress snapshot's withdrawn rows leave the document here,
        // before the trailer gathers any detail, so labels stay aligned to the surviving points
        // by construction. An empty projection skips the walk whole. The gate widens for a
        // view holding arrivals, because a retained cohort can serve an identity the
        // ingress set withdraws without any fitted row entering the bitsets.
        if let Some(delta) = view.delta()
            && (delta.withdraws_any_node()
                || (delta.withdraws_any() && !view.arrivals().is_empty()))
        {
            let row_ids = self.row_ids();
            let arrivals = view.arrivals();
            subtract_withdrawn(&mut delivered, &mut runs, |row| match row {
                ViewRow::Base(position) => delta.withdraws_node(row_ids[position]),
                ViewRow::Arrival(index) => delta.withdraws(arrivals[index].identity),
            });
        }

        // The root publishes the view's own aggregates. The scope resolved the extent once, and the
        // count and resolution are the schedule's, so a scoped root names its own cascade rather
        // than the corpus one. The census is position-bounded, so the corpus arm folds the
        // overlay's delivered count and resolution in here, exactly as a bound cut folds its own.
        let global = (coordinate.z == 0).then(|| {
            scope_cut.map_or_else(
                || {
                    let overlay = view.overlay();
                    let deepest = self.grid.deepest();
                    let arrivals = overlay
                        .min_resolution(deepest)
                        .map_or(0, |bucket| u64::from(bucket.get()));

                    GlobalHead {
                        visible: census.visible()
                            + overlay.delivered_through(self.grid.cut(0), deepest),
                        bounds: census.bounds(),
                        min_resolution: census.min_resolution().max(arrivals),
                    }
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
            first_bucket,
            runs,
            delivered,
            children,
            global,
            mask_set,
        })
    }

    /// Assembles the operator delivery: the corpus fast paths with the view's arrivals merged.
    ///
    /// The view's arrivals join the delivery as splices, and the child bitmask as occupancy the
    /// cumulative schedule has yet to deliver. The deepest zoom's cut is the catch-all, below
    /// which nothing exists. A view holding no arrival keeps the borrowed range shape whole.
    fn corpus_delivery(
        &self,
        walk: &Walk<'_>,
        view: &View<'_>,
        mode: Mode,
        z: u8,
        cell: MortonCell,
        node: Option<&Node>,
    ) -> (DeliveredPoints, u8, Vec<u32>, u8) {
        let mut full = match (mode, z) {
            (Mode::Delta, 0) => walk.root_delta(),
            (Mode::Delta, _) => walk.delta(z, node),
            (Mode::Total, _) => walk.total(z, cell),
        };
        let mut children = node.map_or(0, occupied_children);

        let overlay = view.overlay();
        let splices = if overlay.is_empty() {
            Vec::new()
        } else {
            let cut = self.grid.cut(z);
            if cut < self.grid.deepest()
                && let Some(cells) = cell.children()
            {
                for (index, child) in cells.into_iter().enumerate() {
                    if overlay.occupied_past(cut, child) {
                        children |= 1_u8 << index;
                    }
                }
            }

            walk.splice_arrivals(&mut full, overlay, cell)
        };

        let delivered = if splices.is_empty() {
            DeliveredPoints::Ranges(full.ranges)
        } else {
            DeliveredPoints::Spliced {
                ranges: full.ranges,
                splices,
            }
        };

        (delivered, full.first_bucket, full.runs, children)
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
    fn encode_tile(
        &self,
        document: &TileDocument,
        arrivals: &IdSlice<ArrivalIndex, ArrivalRow>,
        details: Option<&NodeDetails>,
    ) -> Vec<u8> {
        let masks = document
            .mask_set
            .as_ref()
            .map(|set| set.memberships(&self.postings));

        let trailer = details.map(|details| TileTrailer {
            labels: details.labels(),
            icons: details.icons(),
        });

        let response = TileResponse {
            head: TileHead {
                generation: self.generation.id().digest(),
                variant: 0,
                coordinate: document.coordinate,
                mode: document.mode,
                first_bucket: document.first_bucket,
                runs: &document.runs,
                global: document.global,
                children: document.children,
            },
            delivered: document.delivered.as_wire(),
            positions: self.positions(),
            rows: self.wire_rows(),
            arrivals,
            masks: masks.as_deref(),
            trailer,
        };

        response.encode()
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_postgres_store::store::{EntityEvent, EntityUpdate};
    use hash_graph_temporal_versioning::Timestamp;
    use hashql_core::id::{Id as _, IdSlice};
    use type_system::{
        knowledge::entity::{
            EntityId,
            id::{EntityEditionId, EntityUuid},
        },
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::{Mode, TileCoordinate, TileDetail, TileLimits};
    use crate::{
        dataset::auxiliary::{Icon, Label, OwnedLabel},
        identity::{BasePosition, NodeRowId},
        math::{Bounds2, Vec2},
        postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedOntologyTypeUuid},
        salt::wire::tile::{DeliveredSet, GlobalHead, TileHead, TileResponse, TileTrailer},
        serve::{
            CutOffset,
            delta::{DeltaEvent, DeltaRegister, DeltaRevision, DeltaSnapshot, PlacementCohort},
            hydrate::NodeDetails,
            tests::{
                Artifacts, Bound, FIXTURE_LOD, FULL, fixture_row_ids, open_artifacts, publish,
                request, test_codec, viewing,
            },
        },
    };

    /// The detailed-tile path.
    ///
    /// Assembly, entity gathering, and encoding with a hydrated trailer, spliced where the
    /// transport awaits the store.
    ///
    /// The gathered entities carry the fixture's rewritten store-width ids, whose payloads are
    /// empty, so all-empty details stand in for the hydrated columns. The encoded bytes must equal
    /// the wire document built directly with the trailer.
    #[tokio::test]
    #[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
    #[expect(
        clippy::single_range_in_vec_init,
        reason = "an array of one range is what a root delta delivery IS"
    )]
    async fn detailed_tiles_encode_the_hydrated_trailer() {
        let (generation, atlas) = publish("detailed-trailer").await;
        let Artifacts {
            quad,
            morton,
            coordinates,
            rows,
        } = open_artifacts(&generation);
        let points = coordinates.points().expect("wire coordinates are points");
        let row_ids = fixture_row_ids(&rows);

        // The transport path assembles, gathers, hydrates, encodes.
        let mut detailed = request(0, 0, 0, Mode::Delta);
        detailed.query.detail = TileDetail::Auxiliary;
        let document = viewing(&atlas, &FULL, |view| {
            atlas
                .assemble_tile(&detailed, TileLimits::default(), view)
                .expect("assembly serves every detail mode")
        });

        let delivered: u64 = morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
            .iter()
            .sum();
        let delivered = usize::try_from(delivered).expect("fixture counts fit usize");
        assert_eq!(document.delivered.count(), delivered);

        // Hydration is the transport's store round trip; the encode
        // path under test takes its details directly, all-empty here,
        // and the encoded envelope equals the directly built wire
        // document.
        let details = NodeDetails::empty(document.delivered.count());
        let bytes = atlas.encode_tile(&document, IdSlice::from_raw(&[]), Some(&details));

        let no_labels: Vec<&Label> = vec![Label::EMPTY; delivered];
        let no_icons: Vec<&Icon> = vec![Icon::empty(); delivered];
        let end = u32::try_from(delivered).expect("fixture counts fit u32");
        let expected = TileResponse {
            head: TileHead {
                generation: atlas.generation().digest(),
                variant: 0,
                coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
                mode: Mode::Delta,
                first_bucket: 0,
                runs: &morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
                    .iter()
                    .map(|&length| u32::try_from(length).expect("fixture counts fit u32"))
                    .collect::<Vec<_>>(),
                global: Some(GlobalHead {
                    visible: delivered as u64,
                    // The fixture's random points span both axes, so
                    // the frame extent anchors at the full wire
                    // square.
                    bounds: Some(
                        Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0))
                            .expect("the wire square is a valid extent"),
                    ),
                    min_resolution: morton
                        .fenceposts()
                        .lengths()
                        .iter()
                        .rposition(|&length| length > 0)
                        .map_or(0, |bucket| bucket as u64),
                }),
                children: (0..4).fold(0_u8, |bits, quadrant| {
                    bits | (u8::from(quad.nodes()[0].child(quadrant).is_some()) << quadrant)
                }),
            },
            delivered: DeliveredSet::Ranges(&[
                BasePosition::from_u32(0)..BasePosition::from_u32(end)
            ]),
            arrivals: IdSlice::from_raw(&[]),
            positions: IdSlice::from_raw(points),
            rows: IdSlice::from_raw(&{
                let node_codec = test_codec(&atlas);
                row_ids
                    .iter()
                    .map(|&row| node_codec.encode(NodeRowId::from_u32(row), atlas.node_universe()))
                    .collect::<Vec<_>>()
            }),
            masks: None,
            trailer: Some(TileTrailer {
                labels: &no_labels,
                icons: &no_icons,
            }),
        }
        .encode();
        assert_eq!(bytes, expected, "the trailer path is byte-exact");
    }

    /// A captured display reaches the tile trailer's node labels.
    ///
    /// The register captures a revised display for the fitted identity at the root delta
    /// tile's first delivered slot, and the route's bytes must equal the same assembly encoded
    /// with the captured label at that slot alone. The control capture names an undelivered
    /// identity and must answer the baseline bytes.
    #[tokio::test]
    #[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
    async fn captured_display_reaches_tile_labels() {
        let (generation, atlas) = publish("revised-tile-labels").await;
        let Artifacts { morton, rows, .. } = open_artifacts(&generation);
        let row_ids = fixture_row_ids(&rows);
        let delivered: u64 = morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
            .iter()
            .sum();
        let delivered = usize::try_from(delivered).expect("fixture counts fit usize");
        assert!(
            delivered < row_ids.len(),
            "the charter needs a row the root delta tile does not deliver"
        );

        // The fixture rewrite keys each row's identity by the row id itself.
        let identity = |seed: u8| ArchivedEntityId {
            web_id: Uuid::from_bytes([seed; 16]).into(),
            entity_uuid: ArchivedEntityUuid::from_bytes(
                Uuid::from_bytes([seed ^ 0xFF; 16]).into_bytes(),
            ),
        };
        let revised_seed = u8::try_from(row_ids[0]).expect("fixture rows fit u8");
        let undelivered_seed = u8::try_from(row_ids[delivered]).expect("fixture rows fit u8");

        let renamed = OwnedLabel::from("renamed");
        let capturing = |seed: u8| -> DeltaSnapshot {
            let mut register = DeltaRegister::new(
                atlas.node_universe(),
                atlas.edge_universe(),
                atlas.ontology_universe(),
            );
            let event = EntityEvent::Updated(EntityUpdate {
                entity: EntityId {
                    web_id: WebId::new(Uuid::from_bytes([seed; 16])),
                    entity_uuid: EntityUuid::new(Uuid::from_bytes([seed ^ 0xFF; 16])),
                    draft_id: None,
                },
                edition: EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
                archived: false,
                changed_at: Timestamp::from_unix_timestamp(1),
            });
            register.apply(DeltaEvent::from(&event));
            register
                .capture_display(
                    identity(seed),
                    EntityEditionId::new(Uuid::from_u128(u128::from(seed))),
                    &renamed,
                    Icon::new("revised-icon"),
                    ArchivedOntologyTypeUuid::from(Uuid::from_u128(0x117C)),
                    &atlas,
                )
                .expect("the fixture ontology domain has room");

            register.snapshot(
                &atlas,
                DeltaRevision::FIRST,
                Timestamp::from_unix_timestamp(2),
            )
        };

        let mut detailed = request(0, 0, 0, Mode::Delta);
        detailed.query.detail = TileDetail::Auxiliary;

        let serve = |snapshot: Option<&DeltaSnapshot>| {
            let bound = Bound::resolved(
                &atlas,
                &FULL,
                PlacementCohort::of(snapshot),
                CutOffset::ZERO,
            );
            atlas
                .tile(&detailed, TileLimits::default(), bound.view(&atlas))
                .expect("the tile request is on the served grid")
        };

        // The expected envelope is the same assembly, encoded with the captured label at the
        // first delivered slot alone.
        let expected = |label: &Label| {
            let document = viewing(&atlas, &FULL, |view| {
                atlas
                    .assemble_tile(&detailed, TileLimits::default(), view)
                    .expect("assembly serves every detail mode")
            });
            let mut labels: Vec<&Label> = vec![Label::EMPTY; delivered];
            labels[0] = label;
            let icons: Vec<&Icon> = vec![Icon::empty(); delivered];

            atlas.encode_tile(
                &document,
                IdSlice::from_raw(&[]),
                Some(&NodeDetails::new(labels, icons)),
            )
        };

        let captured = capturing(revised_seed);
        assert_eq!(
            serve(Some(&captured)),
            expected(&renamed),
            "the captured label serves at its own slot alone"
        );

        let baseline = serve(None);
        assert_eq!(
            baseline,
            expected(Label::EMPTY),
            "the baseline serves the payload labels"
        );

        let unrelated = capturing(undelivered_seed);
        assert_eq!(
            serve(Some(&unrelated)),
            baseline,
            "a capture the tile never delivers moves nothing"
        );
    }
}
