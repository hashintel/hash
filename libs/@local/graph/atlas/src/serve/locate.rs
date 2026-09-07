//! The locate endpoint.
//!
//! Source resolution, ego-graph assembly, and the request/assembly/encode surface.
//!
//! Locate answers the source's ego-graph, which is every edge incident to the source whose other
//! endpoint is visible, together with the partners those edges connect. Assembly is one adjacency
//! probe plus column gathers, with no spatial index behind it. Locate is the detail view, and the
//! trailer always accompanies the response, so serving locate requires a store connection for
//! hydration.

use hashql_core::id::{IdSlice, IdVec};
use type_system::ontology::id::{BaseUrl, VersionedUrl};

use super::{
    Atlas, ServeLimits, WireRow,
    colour::Palette,
    grid,
    hydrate::{
        DeliveredNodes, DetailError, EdgeSlot, LocateLinkDetails, LocateNodeDetails, LocateOrder,
        LocateStore, NodeSlot, ScalarValue,
    },
    intern::{Table, TableIndex},
    neighbourhood::{DeltaEndpoint, EdgeColumns, EdgeOrigin, Neighbourhood, ServedEdge},
    schedule::{ArrivalIndex, ArrivalRow, ViewRow, cut::ScheduleCut},
    view::{View, ViewError},
    visibility::{ResolvedRow, VisibleRow},
};
use crate::{
    dataset::auxiliary::{Label, Legend},
    identity::{BasePosition, NodeRowId},
    math::Vec2,
    morton::MortonKey,
    postgres::id::ArchivedEntityId,
    salt::{
        lod::stage::WIRE_FRAME,
        wire::{
            locate::{LocateResponse, LocateTrailer, PropertyMap, PropertyValue},
            tile::TileCoordinate,
        },
    },
};

/// The locate endpoint's limits.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct LocateLimits {
    /// Most ego-graph edges one response delivers.
    ///
    /// A larger incident set keeps the edges whose partners lie nearest the source, and HEAD
    /// reports `complete: false`. Every delivered edge also costs live link hydration, so the cap
    /// bounds the store round trip and not only wire bytes.
    pub edges: u32 = 512,
    /// Most properties the source delivers.
    ///
    /// An over-cap entity drops properties reverse-lexicographically by base URL with its label
    /// property protected to the end, so the label survives every cap that admits at least
    /// one property.
    pub properties: u32 = 10,
    /// Most direct types one delivered edge delivers.
    ///
    /// An over-cap link truncates its type list in canonical order and its completeness bit
    /// reads unset.
    pub link_type_ids: u32 = 5,
    /// Most properties one delivered edge delivers.
    ///
    /// The source's drop rule per link.
    pub link_properties: u32 = 10,
}

const impl Default for LocateLimits {
    fn default() -> Self {
        Self { .. }
    }
}

/// The subject's identity in every domain a locate response speaks.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SourcePoint {
    /// The subject, in the domain that publishes it.
    pub subject: SourceSubject,
    /// The first zoom whose cumulative schedule delivers the point.
    pub zoom: u8,
    /// The point's tile at that zoom: the client's fly-to target.
    pub cell: TileCoordinate,
}

/// A locate subject in the domain that publishes it.
///
/// The response speaks two row domains, exactly as a tile's delivered set does. Fitted rows
/// resolve their payloads from the generation's columns, and placed arrivals resolve theirs
/// from the view's arrival table, which holds exactly the admitted arrivals of the entry's
/// cohort.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SourceSubject {
    /// A fitted row, proven visible, with the base position behind it.
    Base {
        /// The node row id.
        row: VisibleRow,
        /// The base position behind the row.
        position: BasePosition,
    },
    /// A placed arrival, addressed into the view's arrival table.
    Arrival(ArrivalIndex),
}

impl Atlas {
    /// Resolves a locate source.
    ///
    /// Upstream entity id to node row, base position, first visible zoom, and fly-to tile.
    ///
    /// [`None`] for everything that does not name a visible node - unparsable, draft-suffixed,
    /// unknown, hidden by the proof, or an edge id - the transport's `unknown-entity` problem,
    /// identical for missing and denied. An identity the generation never fitted resolves
    /// through the view's arrival table instead, under the same absent answer for everything
    /// the table does not hold.
    pub(crate) fn resolve_source(&self, view: &View<'_>, entity_id: &str) -> Option<SourcePoint> {
        let id = super::translate::parse(entity_id)?;
        if let Some(row) = self.node_ids.row_of(id) {
            let row = view.proof().verify(row)?;

            return self.source_point(view, row);
        }

        self.arrival_source(view, id)
    }

    /// Resolves a locate source named by its wire node row id.
    ///
    /// The identifier a rendered tile put in the client's hand.
    ///
    /// Ingress goes through [`Atlas::resolve`], the same keyed codec as egress, so the lookup is
    /// pure arithmetic that resolves in process. [`None`] for out-of-universe values and for rows
    /// the proof hides, collapsed at the resolution before any caller observes the cause. A wire
    /// id allocated for a cohort slot resolves through the view's arrival table, exactly as the
    /// same arrival's entity id does.
    pub(crate) fn resolve_wire_source(
        &self,
        view: &View<'_>,
        wire: WireRow<NodeRowId>,
    ) -> Option<SourcePoint> {
        match self.resolve(view.proof(), view.cohort(), wire)? {
            ResolvedRow::Fitted(row) => self.source_point(view, row),
            ResolvedRow::Arrival(identity) => self.arrival_source(view, identity),
        }
    }

    /// Returns the first zoom whose cumulative schedule delivers a base position under `cut`.
    ///
    /// [`None`] when the view's schedule does not hold the position.
    ///
    /// An operator view inverts the corpus cut rule off the position's fencepost segment, and a
    /// scoped view inverts its own rule `z + span + k` over its own cascade, so the answer is a
    /// function of the visible rows alone and carries no evidence of what the mask removed.
    fn first_visible_zoom(
        &self,
        cut: Option<ScheduleCut<'_>>,
        position: BasePosition,
    ) -> Option<u8> {
        // A corpus bucket is a first-occupant result over every row, hidden ones included, so a
        // scoped view reading it would let a hidden row decide a visible row's zoom.
        cut.map_or_else(
            || Some(self.grid.first_zoom(self.morton.bucket_of(position))),
            |cut| cut.first_zoom(position),
        )
    }

    /// Answers a proven-visible node row's identity in every domain a locate response speaks.
    ///
    /// Base position, first visible zoom, and fly-to tile.
    ///
    /// [`None`] when `view`'s schedule holds no bucket for the row, which collapses into the
    /// endpoint's `unknown-entity`: a source the view's own delivery never reaches is a source
    /// this view cannot locate, and the resolution already answers missing and denied alike.
    fn source_point(&self, view: &View<'_>, row: VisibleRow) -> Option<SourcePoint> {
        // Both ingress paths converge here, so the withdrawal check covers the entity-keyed and
        // the wire-keyed resolutions alike, and a withdrawn source is nonexistent to both.
        if view
            .delta()
            .is_some_and(|delta| delta.withdraws_node(row.get()))
        {
            return None;
        }

        let position = self.positions_of_row()[row.get()];
        let zoom = self.first_visible_zoom(view.cut(), position)?;

        let key = MortonKey::from_bits(self.morton.codes()[position].get());
        let cell = grid::tile_of(key, zoom);

        Some(SourcePoint {
            subject: SourceSubject::Base { row, position },
            zoom,
            cell,
        })
    }

    /// Answers an admitted placed arrival's identity in every domain a locate response speaks.
    ///
    /// Arrival table index, first visible zoom, and fly-to tile. Both ingress paths converge
    /// here, exactly as fitted rows converge on [`Self::source_point`], so the ingress
    /// withdrawal filter covers the entity-keyed and the wire-keyed resolutions alike.
    ///
    /// The zoom inverts the view's own cut rule over the arrival's bucket. Under a bound cut
    /// the bucket is the schedule's or the overlay's, and an operator view reads the overlay's
    /// natural bucket clamped into the corpus catch-all, below which the fit lets nothing sit.
    ///
    /// [`None`] when the ingress capture withdraws the identity and when the view's arrival
    /// table does not hold it - an arrival the scope's own resolution never admitted - both
    /// collapsing into the endpoint's `unknown-entity` exactly as every fitted refusal does.
    fn arrival_source(&self, view: &View<'_>, id: ArchivedEntityId) -> Option<SourcePoint> {
        if view.delta().is_some_and(|delta| delta.withdraws(id)) {
            return None;
        }

        let arrivals = view.arrivals();
        let index = arrivals.partition_point(|row| row.identity < id);
        let row = arrivals.get(index)?;
        if row.identity != id {
            return None;
        }

        let zoom = view.cut().map_or_else(
            || {
                self.grid
                    .first_zoom(view.overlay().bucket_of(index).min(self.grid.deepest()))
            },
            |cut| cut.arrival_first_zoom(index),
        );

        let [x, y] = WIRE_FRAME.quantize(row.position);
        let cell = grid::tile_of(MortonKey::new(x, y), zoom);

        Some(SourcePoint {
            subject: SourceSubject::Arrival(index),
            zoom,
            cell,
        })
    }

    /// Assembles the locate ego-graph around a resolved source.
    ///
    /// Every edge incident to the source whose other endpoint is visible, and the partners those
    /// edges connect. Fitted edges arrive through the generation's adjacency and post-fit links
    /// through the entry cohort, so the graph spans both serving domains whatever domain the
    /// source resolves in.
    ///
    /// Delivered order is the wire's pin: the source first, then the delivered edges' partners
    /// ascending by wire row id. Partners derive from the post-cap edge set - a partner whose
    /// every edge truncated is not delivered. Edges ride ascending by link-entity identity bytes
    /// after the cap - the order is client-verifiable from the `EDGE_IDS` column alone.
    ///
    /// # Panics
    ///
    /// This panics when the view's arrival table does not hold an arrival source's identity,
    /// which source resolution rules out.
    pub(crate) fn locate_subgraph(
        &self,
        source: SourcePoint,
        limits: LocateLimits,
        view: &View<'_>,
    ) -> LocateSubgraph {
        let arrivals = view.arrivals();
        let cohort = view.cohort();

        // The source's row in the entry universe, its wire-frame origin, and its delivered
        // vessel, each in the domain that publishes it. An arrival's row is the cohort slot its
        // placement took.
        let (source_row, origin, source_vessel) = match source.subject {
            SourceSubject::Base { row, position } => (
                row.get(),
                self.positions()[position],
                ViewRow::Base(position),
            ),
            SourceSubject::Arrival(index) => {
                let row = &arrivals[index];
                let slot = cohort
                    .node(row.identity)
                    .expect("the view's arrival table holds the cohort's admitted arrivals")
                    .id;

                (slot, row.position, ViewRow::Arrival(index))
            }
        };

        let neighbourhood = Neighbourhood::of(self, view.proof(), view.delta());

        // Hidden partners drop before selection: the cap selects among visible edges alone, and a
        // response's cardinality is a function of the masked view. The generation's adjacency
        // never names a cohort slot, so an arrival source's fitted half is empty by construction.
        let mut edges: Vec<_> = match source.subject {
            SourceSubject::Base { row, .. } => neighbourhood
                .incident(row.get())
                .into_iter()
                .map(|(edge, id)| (ServedEdge::Fitted(edge), id))
                .collect(),
            SourceSubject::Arrival(_) => Vec::new(),
        };
        edges.extend(
            neighbourhood
                .incident_links(view, source_row)
                .into_iter()
                .map(|(edge, id)| (ServedEdge::Delta(edge), id)),
        );

        let complete = edges.len() <= limits.edges as usize;
        if !complete {
            self.truncate_nearest(&mut edges, limits.edges as usize, source_row, origin, view);
        }

        edges.sort_unstable_by_key(|&(_, id)| id);

        // Partners derive from the delivered edge set. Distinct rows
        // carry distinct wire ids under the entry universe (the codec
        // is a bijection), so adjacent dedup after the wire-keyed
        // sort is exact.
        let positions_of_row = self.positions_of_row();
        let universe = cohort.universe(self.node_universe);
        let mut partners: Vec<_> = edges
            .iter()
            .flat_map(|&(edge, _)| edge.endpoints())
            .filter(|endpoint| endpoint.row() != source_row)
            .map(|endpoint| match endpoint {
                DeltaEndpoint::Fitted(row) => (
                    self.node_codec.encode(row, universe),
                    ViewRow::Base(positions_of_row[row]),
                ),
                DeltaEndpoint::Arrival { identity, .. } => {
                    let index = arrival_index_of(arrivals, identity);
                    (arrivals[index].wire, ViewRow::Arrival(index))
                }
            })
            .collect();
        partners.sort_unstable_by_key(|&(wire, _)| wire);
        partners.dedup_by_key(|&mut (wire, _)| wire);

        let mut delivered = IdVec::with_capacity(partners.len() + 1);
        delivered.push(source_vessel);
        for &(_, vessel) in &partners {
            delivered.push(vessel);
        }

        LocateSubgraph {
            delivered,
            edges,
            complete,
        }
    }

    /// Keeps the `cap` edges whose partners lie nearest the source.
    ///
    /// Ascending (squared wire-frame distance to the partner, partner first-visible zoom,
    /// link-entity identity bytes): equidistant partners cede to the earlier-visible one, and
    /// distinct identities make the key a total order. The key only selects - presentation order
    /// stays ascending identity bytes.
    ///
    /// The zoom reads the view's own cut, so under a scoped view the tie-break ranks partners by
    /// that view's own cascade and which authorized partners survive the cap is a function of the
    /// visible rows alone. An arrival partner reads its position from the view's arrival table
    /// and its zoom through the same inversion an arrival source resolves with.
    fn truncate_nearest(
        &self,
        edges: &mut Vec<(ServedEdge, ArchivedEntityId)>,
        cap: usize,
        source_row: NodeRowId,
        origin: Vec2,
        view: &View<'_>,
    ) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let positions = self.positions();
        let positions_of_row = self.positions_of_row();
        let arrivals = view.arrivals();
        let cut = view.cut();

        let mut ranked: Vec<(NearestKey, (ServedEdge, ArchivedEntityId))> = edges
            .drain(..)
            .map(|(edge, id)| {
                let (point, zoom) = match edge.opposite_endpoint(source_row) {
                    DeltaEndpoint::Fitted(row) => {
                        let position = positions_of_row[row];
                        (
                            positions[position],
                            // A partner the view's schedule does not hold cedes to every
                            // partner it does. The proof admitted each of these rows, so the
                            // schedule built over that proof holds them and the fallback never
                            // selects.
                            self.first_visible_zoom(cut, position).unwrap_or(u8::MAX),
                        )
                    }
                    DeltaEndpoint::Arrival { identity, .. } => {
                        let index = arrival_index_of(arrivals, identity);
                        let zoom = cut.map_or_else(
                            || {
                                self.grid.first_zoom(
                                    view.overlay().bucket_of(index).min(self.grid.deepest()),
                                )
                            },
                            |cut| cut.arrival_first_zoom(index),
                        );

                        (arrivals[index].position, zoom)
                    }
                };
                let (dx, dy) = (point.x() - origin.x(), point.y() - origin.y());
                // Unfused f32 arithmetic pins the selection key, so
                // independent derivations from the wire coordinates
                // agree bit for bit. Squared distances are
                // non-negative finite floats, whose bit patterns
                // order exactly as their values do.
                #[expect(
                    clippy::suboptimal_flops,
                    reason = "a fused mul_add rounds differently and reorders near-ties"
                )]
                let distance = (dx * dx + dy * dy).to_bits();

                (
                    NearestKey {
                        distance,
                        zoom,
                        identity: id,
                    },
                    (edge, id),
                )
            })
            .collect();
        // Partitioning at `cap - 1` places the cap smallest keys - a
        // total order, since link identities are distinct - in the
        // head.
        ranked.select_nth_unstable_by_key(cap - 1, |&(key, _)| key);
        ranked.truncate(cap);
        edges.extend(ranked.into_iter().map(|(_, entry)| entry));
    }
}

/// The nearest-partner truncation's sort key.
///
/// The derived order is the selection rule, ascending squared distance to the partner, then the
/// partner's first visible zoom, then the link-entity identity bytes.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct NearestKey {
    /// The squared wire-frame distance to the partner, by its bit pattern.
    ///
    /// Non-negative finite floats order by bits exactly as by value.
    distance: u32,
    /// The partner's first visible zoom, by which equidistant partners cede to the earlier-visible
    /// one.
    zoom: u8,
    /// The link-entity identity, whose distinctness makes the key a total order.
    identity: ArchivedEntityId,
}

/// Resolves a delivered arrival endpoint's index in the view's arrival table.
///
/// Caller requirement: `identity` resolved through this same table when its edge qualified, so
/// the lookup answers.
///
/// # Panics
///
/// This panics when `identity` resolves to no row of the table, which the caller requirement
/// rules out.
fn arrival_index_of(
    arrivals: &IdSlice<ArrivalIndex, ArrivalRow>,
    identity: ArchivedEntityId,
) -> ArrivalIndex {
    let index = arrivals.partition_point(|row| row.identity < identity);
    assert_eq!(
        arrivals[index].identity, identity,
        "a delivered arrival endpoint resolves in the view's arrival table",
    );

    index
}

/// One assembled locate ego-graph.
///
/// The delivered rows (source first, then partners ascending wire row id) and the capped edge
/// set among them.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct LocateSubgraph {
    /// The delivered rows in delivered order, each in the domain that publishes it.
    pub delivered: IdVec<NodeSlot, ViewRow>,
    /// The delivered edges paired with their link-entity identities, ascending by those bytes.
    pub edges: Vec<(ServedEdge, ArchivedEntityId)>,
    /// Whether the response delivers every qualifying edge. `false` iff the cap truncated.
    pub complete: bool,
}

/// The source entity and the delivery knobs of one locate request.
///
/// Exactly one of two domains names the source: `entityId` (the upstream identity a search result
/// or deep link carries) XOR `row` (the wire node row id a rendered tile put in the client's hand).
/// The fields are distinct JSON types, so the union is unambiguous, and assembly rejects both or
/// neither by name.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LocateRequest {
    /// The source entity id, in the node identity domain.
    ///
    /// Exactly one of this and `row` names the source.
    #[serde(default)]
    pub entity_id: Option<String>,
    /// The source as a wire node row id - the value a tile's `ROW_IDS` column delivered.
    ///
    /// Exactly one of this and `entityId` names the source.
    #[serde(default)]
    pub row: Option<WireRow<NodeRowId>>,
    /// Versioned type URLs conditioning the `TYPE_MASK` column. Absent or empty omits it.
    ///
    /// Also the `typeIdsComplete` reference set: the flag reads `true` exactly when these ids
    /// cover the source's direct types. Entries parse at the transport boundary: a malformed URL
    /// rejects the body, while a well-formed URL this generation never ingested is legal and
    /// reads zero bits.
    #[serde(default)]
    #[schemars(with = "Vec<String>")]
    pub colored_type_ids: Vec<VersionedUrl>,
}

/// A locate request the atlas rejects, by name.
///
/// Every variant is a named, data-carrying rejection for the transport layer to map onto its error
/// vocabulary.
#[derive(Debug)]
pub(crate) enum LocateError {
    /// The source id does not name a visible node - nonexistent.
    ///
    /// Denied and unparsable are identical by doctrine (missing equals denied, and an id that
    /// cannot name an entity is an entity that does not exist). An out-of-universe wire `row`
    /// collapses here too: one body, whatever the input domain.
    UnknownEntity,
    /// The request does not name exactly one source.
    ///
    /// `entityId` and `row` are one subject in two identity domains, and the body must carry
    /// exactly one of them.
    Source {
        /// How many of the two source fields the body carries - zero or two, never one.
        carried: usize,
    },
    /// The request carries more `coloredTypeIds` than the cap admits.
    Types {
        /// The carried id count.
        count: usize,
        /// The cap the manifest publishes as `limits.coloredTypeIds`.
        maximum: u32,
    },
    /// The delivery view did not bind.
    ///
    /// A binding refusal converts into this variant through [`From`], so one error union carries a
    /// route's binding and assembly rejections together. [`Atlas::locate`] takes the view already
    /// bound, so its own rejections are all request-shaped.
    View(ViewError),
    /// The store half of the response failed.
    ///
    /// Only [`Atlas::locate`] answers this, because that path places the hydration order itself.
    Details(DetailError),
}

impl core::fmt::Display for LocateError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::UnknownEntity => fmt.write_str("the entity id does not name a visible node"),
            Self::Source { carried } => {
                write!(
                    fmt,
                    "the request carries {carried} source fields where exactly one of entityId \
                     and row names the subject"
                )
            }
            Self::Types { count, maximum } => {
                write!(
                    fmt,
                    "the request carries {count} coloredTypeIds where the cap admits {maximum}"
                )
            }
            Self::View(error) => error.fmt(fmt),
            Self::Details(error) => error.fmt(fmt),
        }
    }
}

impl core::error::Error for LocateError {}

impl From<ViewError> for LocateError {
    fn from(value: ViewError) -> Self {
        Self::View(value)
    }
}

/// One assembled locate response: everything [`Atlas::encode_locate`] needs.
///
/// The document owns its columns apart from the view's arrival table, which it borrows for the
/// request's own scope. The envelope places hydration last, and the split mirrors it. Assembly
/// and encoding are CPU-bound, and hydration awaits the store between them - the hydration
/// boundary materializes the identities it sends, so the borrow never leaves the request.
#[derive(Debug)]
pub(crate) struct LocateDocument<'view> {
    source: SourcePoint,
    /// The delivered rows, source first, each in the domain that publishes it.
    delivered: IdVec<NodeSlot, ViewRow>,
    /// The view's arrival table, which the delivered arrival vessels address.
    arrivals: &'view IdSlice<ArrivalIndex, ArrivalRow>,
    /// The delivered edges in column form, ascending link-entity identity bytes.
    edges: EdgeColumns,
    complete: bool,
    mask_set: Option<super::colour::MaskSet>,
    /// The request's parsed palette, the `typeIdsComplete` reference set.
    palette: Palette,
}

impl Atlas {
    /// Answers one locate request over its bound delivery view.
    ///
    /// `SALTILEL` envelope bytes carrying the source's ego-graph, ready to send under
    /// `application/vnd.hash.saltile-v1`.
    ///
    /// Locate is the detail view, so the trailer always accompanies the response: `store` answers
    /// the one hydration order this call places, and every label resolves in process - from the
    /// generation's own payloads, or a placed arrival's placement capture - keyed on the
    /// answer's resolution columns.
    ///
    /// # Errors
    ///
    /// As [`Atlas::assemble_locate`], plus [`LocateError::Details`] when the store half of the
    /// response fails.
    ///
    /// # Panics
    ///
    /// This panics when an identity table contradicts the row columns behind the delivered set,
    /// which open's cross-artifact validation rules out.
    pub(crate) fn locate(
        &self,
        request: &LocateRequest,
        limits: ServeLimits,
        view: View<'_>,
        store: impl LocateStore,
    ) -> Result<Vec<u8>, LocateError> {
        let document = self.assemble_locate(request, limits, &view)?;

        let nodes = self.locate_node_entities(&document);

        let hydration = store
            .hydrate(LocateOrder {
                nodes,
                links: document.edges.ids(),
                properties: limits.locate.properties,
                link_type_ids: limits.locate.link_type_ids,
                link_properties: limits.locate.link_properties,
            })
            .map_err(LocateError::Details)?;

        let row_ids = self.rows.view();

        // Unlike tile's detail pass, no captures_any hoist guards the per-row overlay reads
        // here: the edge cap bounds locate's delivered set (the source plus at most the cap's
        // partners), so the reads stay bounded per response.
        let cohort = view.cohort();
        let node_labels = document
            .delivered
            .iter_enumerated()
            .map(|(slot, &vessel)| -> &Label {
                if !hydration.nodes.resolved.contains(slot) {
                    return Label::EMPTY;
                }

                match vessel {
                    // Captured display first, generation payload second (the register's own
                    // precedence), so a revised fitted identity serves its freshest label.
                    ViewRow::Base(position) => {
                        let row = row_ids[position];
                        let id = self
                            .node_ids
                            .id(row)
                            .expect("open validated the identity rows against the code column");

                        cohort.legend_of(id).map_or_else(
                            || {
                                self.node_ids
                                    .payload_of(row)
                                    .expect(
                                        "open validated the identity rows against the code column",
                                    )
                                    .label()
                            },
                            Legend::label,
                        )
                    }
                    // The generation holds no payload for an entity placed after the fit: the
                    // label is the placement's captured legend, under the same store-resolution
                    // hold every fitted label takes.
                    ViewRow::Arrival(index) => {
                        AsRef::<Legend>::as_ref(&document.arrivals[index].legend).label()
                    }
                }
            })
            .collect();
        let node_details = LocateNodeDetails::new(
            node_labels,
            hydration.nodes.type_urls,
            hydration.nodes.source_properties,
            hydration.nodes.source_properties_complete,
        );

        let link_labels = document
            .edges
            .origins()
            .iter()
            .zip(document.edges.ids())
            .zip(&hydration.links.properties)
            .map(|((&origin, &id), properties)| -> &Label {
                // An unresolved link reads the empty label.
                if properties.is_none() {
                    return Label::EMPTY;
                }

                // Captured display first, generation payload second (the register's own
                // precedence), so a revised fitted link serves its freshest label here exactly
                // as it does on the edges trailer.
                cohort
                    .legend_of(id)
                    .unwrap_or_else(|| match origin {
                        EdgeOrigin::Fitted(row) => self.edge_ids.payload_of(row).expect(
                            "open validated the identity rows against the adjacency's edges",
                        ),
                        EdgeOrigin::Delta => unreachable!(
                            "publication withholds a link until its legend captures, and the \
                             delivered set admits links from the cohort's own snapshot"
                        ),
                    })
                    .label()
            })
            .collect();
        let link_details = LocateLinkDetails::new(
            link_labels,
            hydration.links.type_urls,
            hydration.links.type_urls_complete,
            hydration.links.properties,
            hydration.links.properties_complete,
        );

        Ok(self.encode_locate(&document, &node_details, &link_details))
    }

    /// Assembles one locate request into its owned document.
    ///
    /// Every rejection happens here, so encoding cannot fail.
    ///
    /// The `coloredTypeIds` cap is the tile endpoint's own - one manifest key,
    /// `limits.coloredTypeIds`, governs the field wherever it occurs.
    ///
    /// Version 0 serves the full unfiltered set. The body vocabulary admits no visibility filter,
    /// so a request naming one rejects as `invalid-body` rather than receiving bytes that ignore
    /// the filter.
    ///
    /// # Errors
    ///
    /// Returns [`LocateError::Source`] when the body does not name exactly one of `entityId` and
    /// `row`, [`LocateError::UnknownEntity`] when the source does not resolve to a visible node,
    /// and [`LocateError::Types`] when the request carries more `coloredTypeIds` than
    /// `limits.tile.colored_type_ids`. The delivery contract is `view`'s, checked when it bound,
    /// so no rejection here is about it.
    fn assemble_locate<'view>(
        &self,
        request: &LocateRequest,
        limits: ServeLimits,
        view: &View<'view>,
    ) -> Result<LocateDocument<'view>, LocateError> {
        if request.colored_type_ids.len() > limits.tile.colored_type_ids as usize {
            return Err(LocateError::Types {
                count: request.colored_type_ids.len(),
                maximum: limits.tile.colored_type_ids,
            });
        }

        // Both source forms resolve through different ingress paths yet reach the same SourcePoint
        // domain, and every failure past this match is one rejection: unknown-entity.
        let source = match (request.entity_id.as_deref(), request.row) {
            (Some(id), None) => self.resolve_source(view, id),
            (None, Some(wire)) => self.resolve_wire_source(view, wire),
            (entity, row) => {
                return Err(LocateError::Source {
                    carried: usize::from(entity.is_some()) + usize::from(row.is_some()),
                });
            }
        }
        .ok_or(LocateError::UnknownEntity)?;

        let LocateSubgraph {
            delivered,
            edges,
            complete,
        } = self.locate_subgraph(source, limits.locate, view);

        let palette = Palette::of(&request.colored_type_ids);
        let mask_set = (!palette.is_empty()).then(|| self.resolve_masks(&palette));

        Ok(LocateDocument {
            source,
            delivered,
            arrivals: view.arrivals(),
            edges: EdgeColumns::of(
                &self.node_codec,
                view.cohort().universe(self.node_universe),
                &edges,
            ),
            complete,
            mask_set,
            palette,
        })
    }

    /// Views the entity identities behind the document's delivered nodes, in slot order.
    ///
    /// The node hydration request's subject. The link subject needs no counterpart: assembly
    /// already materializes the delivered link identities as the document's `EDGE_IDS` column.
    #[must_use]
    pub(crate) fn locate_node_entities<'doc>(
        &'doc self,
        document: &'doc LocateDocument<'_>,
    ) -> DeliveredNodes<'doc> {
        DeliveredNodes::new(
            self.node_ids.ids(),
            self.rows.view(),
            &document.delivered,
            document.arrivals,
        )
    }

    /// Encodes an assembled document with its hydrated details.
    ///
    /// `SALTILEL` envelope bytes, ready for the wire under `application/vnd.hash.saltile-v1`.
    /// Locate is the detail view, so the trailer always accompanies the response and every call
    /// needs hydrated details.
    ///
    /// The trailer interns type and property URLs at encode time. Each table is the bytewise-sorted
    /// union of every reference the trailer makes, and every reference keys by index into it. The
    /// per-entity ascending-name order the hydration layer produces is ascending index order, so
    /// the wire laws hold by construction. The source's `HEAD` flags derive here: `typeIdsComplete`
    /// tests the source's direct types against the request's `coloredTypeIds`, and
    /// `propertiesComplete` echoes the hydration layer's whole-set attestation.
    ///
    /// # Panics
    ///
    /// This panics when supplied details do not cover the document's delivered nodes and edges,
    /// which is a transport bug rather than request data.
    #[must_use]
    fn encode_locate(
        &self,
        document: &LocateDocument<'_>,
        nodes: &LocateNodeDetails,
        links: &LocateLinkDetails,
    ) -> Vec<u8> {
        let masks = document
            .mask_set
            .as_ref()
            .map(|set| set.memberships(&self.postings));

        // The source's identity always travels in HEAD, and the
        // per-edge link identities are first-class columns. Both read
        // in process: a fitted source from the generation-baked
        // tables, an arrival from the view's own table.
        let entity_id = match document.source.subject {
            SourceSubject::Base { row, .. } => self
                .node_ids
                .id(row.get())
                .expect("open validated the identity rows against the code column"),
            SourceSubject::Arrival(index) => document.arrivals[index].identity,
        };

        let type_ids_complete = covers_source_types(
            nodes.source_properties().is_some(),
            &nodes.type_urls()[NodeSlot::new(0)],
            &document.palette,
        );

        let (type_table, type_ids, link_type_ids) =
            intern_types(nodes.type_urls(), links.type_urls());
        let (property_table, mut property_maps) =
            intern_properties(nodes.source_properties(), links.properties());
        let link_property_maps = property_maps.split_off(1);
        let source_properties = property_maps
            .pop()
            .expect("the source's map is the intern order's first entry");

        let link_properties: IdVec<_, _> = link_property_maps.iter().map(Option::as_ref).collect();

        LocateResponse {
            generation: self.generation.id().digest(),
            variant: 0,
            cell: document.source.cell,
            complete: document.complete,
            entity_id,
            type_ids_complete,
            properties_complete: nodes.source_properties_complete(),
            delivered: &document.delivered,
            arrivals: document.arrivals,
            positions: self.positions(),
            rows: self.wire_rows(),
            masks: masks.as_deref(),
            edges: &document.edges,
            trailer: LocateTrailer {
                type_table: type_table.entries(),
                property_table: property_table.entries(),
                labels: nodes.labels(),
                type_ids: &type_ids,
                properties: source_properties.as_ref(),
                link_labels: links.labels(),
                link_type_ids: &link_type_ids,
                link_type_ids_complete: links.type_urls_complete(),
                link_properties: &link_properties,
                link_properties_complete: links.properties_complete(),
            },
        }
        .encode()
    }
}

/// One entity's interned property map.
///
/// `None` marks an entity the store no longer serves.
type PropertyMapView<'doc> = Option<PropertyMap<'doc>>;

/// Node representative-type references into one response's type table, delivered order.
type NodeTypeIds = IdVec<NodeSlot, Option<TableIndex<VersionedUrl>>>;

/// Link type lists into one response's type table, edge order.
type LinkTypeIds = IdVec<EdgeSlot, Vec<TableIndex<VersionedUrl>>>;

/// Returns whether a request's palette covers the source's direct types.
///
/// The `typeIdsComplete` predicate holds when every direct type of the source names a palette
/// entry. Coverage compares ontology identities, the same identity the `TYPE_MASK` resolution
/// derives. `false` when the store no longer serves the source (`present` reads false) or records
/// no types for it, since coverage of an unreadable set carries no attestation. `false` too on a
/// palette with no resolvable entry, which covers nothing.
pub(crate) fn covers_source_types(
    present: bool,
    types: &[VersionedUrl],
    palette: &Palette,
) -> bool {
    present && !types.is_empty() && types.iter().all(|url| palette.covers(url))
}

/// Builds the type intern table and every type reference into it.
///
/// The table is the bytewise-sorted, deduplicated rendering of each node's representative type
/// and each link's capped type list. Node references are the representative-type indexes
/// (`None` for a node without a recorded type). Link references keep the hydration layer's
/// canonical type order.
pub(crate) fn intern_types<'doc>(
    nodes: &'doc IdSlice<NodeSlot, Vec<VersionedUrl>>,
    links: &'doc IdSlice<EdgeSlot, Vec<VersionedUrl>>,
) -> (Table<'doc, VersionedUrl>, NodeTypeIds, LinkTypeIds) {
    let table = Table::new(
        nodes
            .iter()
            .filter_map(|urls| urls.first())
            .chain(links.iter().flatten()),
    );

    let type_ids = nodes
        .iter()
        .map(|urls| urls.first().map(|url| table.index_of(url)))
        .collect();
    let link_type_ids = links
        .iter()
        .map(|urls| urls.iter().map(|url| table.index_of(url)).collect())
        .collect();

    (table, type_ids, link_type_ids)
}

/// Views one hydrated value in the wire's borrowed form.
const fn wire_value(value: &ScalarValue) -> PropertyValue<'_> {
    match value {
        ScalarValue::String(text) => PropertyValue::Text(text.as_str()),
        ScalarValue::Integer(value) => PropertyValue::Integer(*value),
        ScalarValue::Float(value) => PropertyValue::Float(*value),
        ScalarValue::Bool(flag) => PropertyValue::Boolean(*flag),
        ScalarValue::Null => PropertyValue::Null,
    }
}

/// Builds the property intern table and the per-entity uint-index maps.
///
/// The table is the bytewise-sorted, deduplicated union of the source's and every link's
/// surviving names; the returned maps lead with the source's, then the links' in edge order. Each
/// map keeps the hydration layer's ascending-name order, which maps to ascending indexes.
pub(crate) fn intern_properties<'doc>(
    source: Option<&'doc [(BaseUrl, ScalarValue)]>,
    links: &'doc IdSlice<EdgeSlot, Option<Vec<(BaseUrl, ScalarValue)>>>,
) -> (Table<'doc, BaseUrl>, Vec<PropertyMapView<'doc>>) {
    let sets = core::iter::once(source).chain(links.iter().map(Option::as_deref));

    let table = Table::new(
        sets.clone()
            .flatten()
            .flat_map(|entries| entries.iter().map(|(name, _)| name)),
    );

    let maps = sets
        .map(|entry| {
            let survivors = entry?;

            Some(PropertyMap::new_unchecked(
                survivors
                    .iter()
                    .map(|(name, value)| (table.index_of(name), wire_value(value)))
                    .collect(),
            ))
        })
        .collect();

    (table, maps)
}
