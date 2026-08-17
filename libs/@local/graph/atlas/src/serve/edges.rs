//! Edges delivery.
//!
//! The edges among the listed tiles' delivered rows, answered as `SALTILEE` envelope bytes in
//! ascending link-entity identity order. Fitted edges are the generation's own rows, gathered
//! by the structural walk. The entry cohort's published post-fit links join them wherever both
//! endpoints deliver, and each merges into the same identity order and competes in the same
//! rank union at the cap.

use core::{error::Error, fmt};

use hashql_core::{
    collections::FastHashMap,
    id::{IdVec, bit_vec::DenseBitSet},
};
use type_system::ontology::id::VersionedUrl;

use super::{
    Atlas, grid,
    hydrate::{DetailError, EdgeLinkDetails, EdgeSlot, EdgesOrder, EdgesStore, TypeSlot},
    intern::{Table, TableIndex},
    neighbourhood::{DeliveredBounds, EdgeColumns, EdgeOrigin, EdgeSet},
    schedule::ViewRow,
    view::{View, ViewError},
    walk::Walk,
};
use crate::{
    postgres::id::ArchivedOntologyTypeUuid,
    salt::wire::{
        edges::{EdgesResponse, EdgesTrailer},
        tile::TileCoordinate,
    },
};

/// An edges request the atlas rejects, by name.
///
/// Every variant is a named, data-carrying rejection for the transport layer to map onto its error
/// vocabulary.
#[derive(Debug)]
pub(crate) enum EdgesError {
    /// The request lists more tiles than the cap admits.
    Tiles {
        /// The listed tile count.
        count: usize,
        /// The cap the manifest publishes as `limits.edgesTiles`.
        maximum: u32,
    },
    /// A listed zoom exceeds the generation's deepest served tile.
    Depth {
        /// The requested zoom.
        z: u8,
        /// The generation's deepest served zoom.
        maximum: u8,
    },
    /// A listed coordinate lies outside its zoom's `2^z` grid.
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
    /// The delivery view did not bind.
    ///
    /// A binding refusal converts into this variant through [`From`], so one error union carries a
    /// route's binding and assembly rejections together. [`Atlas::edges`] takes the view already
    /// bound, so its own rejections are all request-shaped.
    View(ViewError),
    /// The store half of the detail trailer failed.
    ///
    /// Only [`Atlas::edges`] answers this, because that path places the hydration order itself,
    /// and only a request asking for the detail trailer places one.
    Details(DetailError),
}

impl fmt::Display for EdgesError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Tiles { count, maximum } => {
                write!(
                    fmt,
                    "the request lists {count} tiles where the cap admits {maximum}"
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
            Self::View(error) => error.fmt(fmt),
            Self::Details(error) => error.fmt(fmt),
        }
    }
}

impl Error for EdgesError {}

impl From<ViewError> for EdgesError {
    fn from(value: ViewError) -> Self {
        Self::View(value)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) enum EdgesDetail {
    #[default]
    Minimal,
    Auxiliary,
}

/// The POST body of one edges read.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct EdgesRequest {
    /// The tiles whose delivered rows bound the edge set.
    pub tiles: Vec<TileCoordinate>,
    /// Whether the response carries the detail trailer.
    #[serde(default)]
    pub detail: EdgesDetail,
}

/// The edges endpoint's request and response limits.
///
/// Transport configuration with documented defaults, never wire constants: the transport constructs
/// one value and the manifest publishes the same value, so enforcement and advertisement cannot
/// disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct EdgesLimits {
    /// Most tiles one request may list.
    ///
    /// The manifest publishes this value as `limits.edgesTiles`.
    pub tiles: u32 = 256,
    /// Most edges one response delivers.
    ///
    /// Beyond it the rank-ordered cap truncates and `HEAD` reports `complete: false`.
    ///
    /// One delivered edge spends 40 bytes of columns across a 4-byte source, a 4-byte target, and its 32-byte link entity id. The default cap of `0x4000` edges bounds one response's columns at 640 KiB.
    pub edges: u32 = 0x4000,
}

const impl Default for EdgesLimits {
    fn default() -> Self {
        Self { .. }
    }
}

/// One assembled edges response: everything [`Atlas::encode_edges`] needs.
///
/// The document owns its columns, so it crosses thread boundaries between assembly, hydration, and
/// encoding - the envelope was designed for hydration-last, and the split mirrors it: assembly and
/// encoding are CPU-bound, hydration awaits the store between them.
#[derive(Debug)]
pub(crate) struct EdgesDocument {
    complete: bool,
    /// The delivered edges in column form, ascending link-entity identity bytes.
    edges: EdgeColumns,
}

impl Atlas {
    /// Answers one edges request over its bound delivery view.
    ///
    /// `SALTILEE` envelope bytes carrying the edges whose endpoints both lie in the listed tiles'
    /// delivered rows, ready to send under `application/vnd.hash.saltile-v1`.
    ///
    /// A request asking for the detail trailer resolves fitted labels and representative types
    /// in process from the generation's own payloads, and `store` answers the one hydration
    /// order such a request places: the required type uuids' versioned URLs and the delta links'
    /// displays. A minimal request drops the capability unused.
    ///
    /// # Errors
    ///
    /// As [`Atlas::assemble_edges`], plus [`EdgesError::Details`] when the store half of the
    /// detail trailer fails.
    pub(crate) fn edges(
        &self,
        request: &EdgesRequest,
        limits: EdgesLimits,
        view: View<'_>,
        store: impl EdgesStore,
    ) -> Result<Vec<u8>, EdgesError> {
        let document = self.assemble_edges(request, limits, &view)?;

        // The hydration owns the delta displays the details borrow, so it lives beside the
        // document until the encode consumes both.
        let hydration;
        let details = match request.detail {
            EdgesDetail::Minimal => None,
            EdgesDetail::Auxiliary => {
                // A fitted link's type reference is the generation's own representative, so
                // only the distinct type uuids reach the store, in first-occurrence order. A
                // delta link's whole display is a store read keyed by identity.
                let mut delta = Vec::new();
                let mut required: IdVec<TypeSlot, ArchivedOntologyTypeUuid> = IdVec::new();
                let mut slots: FastHashMap<ArchivedOntologyTypeUuid, TypeSlot> =
                    FastHashMap::default();
                let mut fitted_slots: Vec<Option<TypeSlot>> = Vec::new();
                for (slot, &origin) in document.edges.origins().iter_enumerated() {
                    match origin {
                        EdgeOrigin::Fitted(edge) => {
                            let legend = self.edge_ids.payload_of(edge).expect(
                                "open validated the identity rows against the adjacency's edges",
                            );
                            fitted_slots.push(
                                self.ontology_ids.id(legend.representative_ontology()).map(
                                    |uuid| {
                                        *slots.entry(uuid).or_insert_with(|| required.push(uuid))
                                    },
                                ),
                            );
                        }
                        EdgeOrigin::Delta => delta.push(document.edges.ids()[slot]),
                    }
                }

                hydration = store
                    .hydrate(EdgesOrder {
                        fitted: &required,
                        delta: &delta,
                    })
                    .map_err(EdgesError::Details)?;

                let mut fitted_types = fitted_slots.iter().copied();
                let mut displays = hydration.delta.iter();
                let mut labels = IdVec::with_capacity(document.edges.count());
                let mut representative_type_urls = IdVec::with_capacity(document.edges.count());
                for &origin in document.edges.origins() {
                    match origin {
                        EdgeOrigin::Fitted(edge) => {
                            labels.push(
                                self.edge_ids
                                    .payload_of(edge)
                                    .expect(
                                        "open validated the identity rows against the adjacency's \
                                         edges",
                                    )
                                    .label(),
                            );
                            representative_type_urls.push(
                                fitted_types
                                    .next()
                                    .expect("the fitted slots cover the fitted order")
                                    .and_then(|slot| hydration.fitted[slot].clone()),
                            );
                        }
                        EdgeOrigin::Delta => {
                            let display = displays
                                .next()
                                .expect("the hydration covers the delta order");
                            labels.push(&*display.label);
                            representative_type_urls.push(display.representative_type.clone());
                        }
                    }
                }

                Some(EdgeLinkDetails::new(labels, representative_type_urls))
            }
        };

        Ok(self.encode_edges(&document, details.as_ref()))
    }

    /// Assembles one edges request into its owned document.
    ///
    /// Every rejection happens here, so encoding cannot fail.
    ///
    /// Delivery order is ascending link-entity identity bytes, independent of the tiles listed and
    /// of truncation, so identical requests yield identical bytes under one bound serving state
    /// (generation, visibility, secret, limits) - and the order is client-verifiable from the
    /// `EDGE_IDS` column alone, carrying no internal-order information. Beyond `limits.edges` the
    /// rank-ordered cap keeps the edges whose worse endpoint ranks best - an edge is only as
    /// prominent as its less-prominent endpoint - with ties broken by identity bytes, and `HEAD`
    /// reports `complete: false`.
    ///
    /// The bounding set is the tile route's own delivery under `view`. An operator view unions the
    /// corpus schedule's cumulative prefixes at `z + span`, and a scoped view its own cascade's at
    /// `z + span + k`, which is exactly the set of rows its tiles rendered.
    ///
    /// An edge delivers under three conditions the proof states together. The proof holds the
    /// edge's own link row and both of its endpoints. The delivered row sets intersect the proof
    /// before edges qualify, and the link row carries the link entity's own authorization, which
    /// its endpoints do not imply.
    ///
    /// Version 0 serves the full unfiltered edge set. The body vocabulary admits no visibility
    /// filter, so a request naming one rejects as `invalid-body` rather than receiving bytes that
    /// ignore the filter without saying so.
    ///
    /// # Errors
    ///
    /// Returns [`EdgesError::Tiles`] when the request lists more tiles than `limits.tiles`,
    /// [`EdgesError::Depth`] when a listed zoom exceeds the generation's deepest served tile, and
    /// [`EdgesError::Grid`] when a listed coordinate lies outside its zoom's grid. The delivery
    /// contract is `view`'s, checked when it bound, so no rejection here is about it.
    fn assemble_edges(
        &self,
        request: &EdgesRequest,
        limits: EdgesLimits,
        view: &View<'_>,
    ) -> Result<EdgesDocument, EdgesError> {
        if request.tiles.len() > limits.tiles as usize {
            return Err(EdgesError::Tiles {
                count: request.tiles.len(),
                maximum: limits.tiles,
            });
        }

        let walk = Walk::of(self, view.proof());
        let bounds = self.delivered_bounds(&walk, view, &request.tiles)?;
        let set = EdgeSet::of(self, view, bounds, limits.edges as usize);

        Ok(EdgesDocument {
            complete: set.complete(),
            edges: EdgeColumns::of(
                &self.node_codec,
                view.cohort().universe(self.universe),
                set.edges(),
            ),
        })
    }

    /// Encodes an assembled document.
    ///
    /// `SALTILEE` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`. The
    /// response carries the detail trailer iff the caller supplies `details`.
    ///
    /// The trailer interns type URLs at encode time. The table is the bytewise-sorted union of
    /// every edge's representative type, and each reference keys by index into it.
    ///
    /// # Panics
    ///
    /// This panics when supplied details do not cover the document's delivered edges, which is a
    /// transport bug rather than request data.
    #[must_use]
    fn encode_edges(
        &self,
        document: &EdgesDocument,
        details: Option<&EdgeLinkDetails<'_>>,
    ) -> Vec<u8> {
        let columns = details.map(|details| {
            let table = Table::new(details.representative_type_urls().iter().flatten());
            let link_type_ids: IdVec<EdgeSlot, Option<TableIndex<VersionedUrl>>> = details
                .representative_type_urls()
                .iter()
                .map(|url| url.as_ref().map(|url| table.index_of(url)))
                .collect();

            (details.labels(), table, link_type_ids)
        });

        let trailer = columns
            .as_ref()
            .map(|(labels, table, link_type_ids)| EdgesTrailer {
                type_table: table.entries(),
                link_labels: labels,
                link_type_ids,
            });

        EdgesResponse {
            generation: self.generation.id().digest(),
            variant: 0,
            complete: document.complete,
            edges: &document.edges,
            trailer,
        }
        .encode()
    }

    /// Collects the union of the listed tiles' delivered sets, one per serving domain.
    ///
    /// A tile's delivered set is mode-independent - its cumulative delta set equals its total set -
    /// so the union is one cumulative-schedule read per tile, deduplicated by the sets
    /// themselves. A scoped view reads its own cascade's prefix through its cut, arrivals
    /// included, while an operator view reads the corpus schedule's runs and its overlay's
    /// arrival runs. Each is the delivery the tile route answers under that same view.
    fn delivered_bounds(
        &self,
        walk: &Walk<'_>,
        view: &View<'_>,
        tiles: &[TileCoordinate],
    ) -> Result<DeliveredBounds, EdgesError> {
        let mut rows = DenseBitSet::new_empty(self.rows.len());
        let mut arrivals = DenseBitSet::new_empty(view.arrivals().len());
        let maximum = self.grid.max_tile_depth();
        for &coordinate in tiles {
            if coordinate.z > maximum {
                return Err(EdgesError::Depth {
                    z: coordinate.z,
                    maximum,
                });
            }
            let cell = grid::cell_of(coordinate).ok_or(EdgesError::Grid {
                z: coordinate.z,
                x: coordinate.x,
                y: coordinate.y,
            })?;

            if let Some(cut) = view.cut() {
                let row_ids = self.rows.view();
                for row in cut.total(coordinate.z, cell).rows {
                    match row {
                        ViewRow::Base(position) => {
                            rows.insert(row_ids[position]);
                        }
                        ViewRow::Arrival(index) => {
                            arrivals.insert(index);
                        }
                    }
                }
            } else {
                walk.delivered_rows_into(coordinate.z, cell, &mut rows);
                let deepest = self.grid.deepest();
                for bucket in self.grid.cut_buckets(coordinate.z) {
                    for (_, index) in view.overlay().run(bucket, cell, deepest) {
                        arrivals.insert(index);
                    }
                }
            }
        }

        Ok(DeliveredBounds { rows, arrivals })
    }
}
