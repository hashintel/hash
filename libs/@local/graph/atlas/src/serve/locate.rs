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
    Atlas, ServeLimits, TileCoordinate, WireRow,
    colour::Palette,
    grid,
    hydrate::{
        DeliveredNodes, DetailError, EdgeSlot, LocateLinkDetails, LocateNodeDetails, LocateOrder,
        LocateStore, NodeSlot, ScalarValue,
    },
    intern::{Table, TableIndex},
    neighbourhood::{DeliveredEdge, EdgeColumns, Neighbourhood},
    schedule::cut::ScheduleCut,
    view::{View, ViewError},
    visibility::VisibleRow,
};
use crate::{
    dataset::{auxiliary::Label, postgres::id::ArchivedEntityId},
    identity::{BasePosition, NodeRowId},
    morton::MortonKey,
    salt::wire::locate::{LocateResponse, LocateTrailer, PropertyMap, PropertyValue},
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
    /// The node row id.
    pub row: VisibleRow,
    /// The base position behind the row.
    pub position: BasePosition,
    /// The first zoom whose cumulative schedule delivers the point.
    pub zoom: u8,
    /// The point's tile at that zoom: the client's fly-to target.
    pub cell: TileCoordinate,
}

impl Atlas {
    /// Resolves a locate source.
    ///
    /// Upstream entity id to node row, base position, first visible zoom, and fly-to tile.
    ///
    /// [`None`] for everything that does not name a visible node - unparsable, draft-suffixed,
    /// unknown, hidden by the proof, or an edge id - the transport's `unknown-entity` problem,
    /// identical for missing and denied.
    pub(crate) fn resolve_source(&self, view: &View<'_>, entity_id: &str) -> Option<SourcePoint> {
        let id = super::translate::parse(entity_id)?;
        let row = self.node_ids.row_of(id)?;
        let row = view.proof().verify(row)?;

        self.source_point(view, row)
    }

    /// Resolves a locate source named by its wire node row id.
    ///
    /// The identifier a rendered tile put in the client's hand.
    ///
    /// Ingress goes through [`Atlas::resolve`], the same keyed codec as egress, so the lookup is
    /// pure arithmetic that resolves in process. [`None`] for out-of-universe values and for rows
    /// the proof hides, collapsed at the seam before any caller observes the cause.
    pub(crate) fn resolve_wire_source(
        &self,
        view: &View<'_>,
        wire: WireRow<NodeRowId>,
    ) -> Option<SourcePoint> {
        let row = self.resolve(view.proof(), wire)?;

        self.source_point(view, row)
    }

    /// Returns the first zoom whose cumulative schedule delivers a base position under `cut`.
    ///
    /// [`None`] when the view's schedule does not hold the position.
    ///
    /// An operator view inverts the corpus cut rule off the position's fencepost segment. A scoped
    /// view inverts its own rule `z + span + k` over its own cascade, so the answer is a function
    /// of the visible rows alone and carries no evidence of what the mask removed.
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
    /// this view cannot locate, and the seam already answers missing and denied alike.
    fn source_point(&self, view: &View<'_>, row: VisibleRow) -> Option<SourcePoint> {
        let position = self.positions_of_row()[row.get()];
        let zoom = self.first_visible_zoom(view.cut(), position)?;

        let key = MortonKey::from_bits(self.morton.codes()[position].get());
        let cell = grid::tile_of(key, zoom);

        Some(SourcePoint {
            row,
            position,
            zoom,
            cell,
        })
    }

    /// Assembles the locate ego-graph around a resolved source.
    ///
    /// Every edge incident to the source whose other endpoint is visible, and the partners those
    /// edges connect.
    ///
    /// Delivered order is the wire's pin: the source first, then the delivered edges' partners
    /// ascending by wire row id. Partners derive from the post-cap edge set - a partner whose
    /// every edge truncated is not delivered. Edges ride ascending by link-entity identity bytes
    /// after the cap - the order is client-verifiable from the `EDGE_IDS` column alone.
    pub(crate) fn locate_subgraph(
        &self,
        source: SourcePoint,
        limits: LocateLimits,
        view: &View<'_>,
    ) -> LocateSubgraph {
        // Hidden partners drop before selection: the cap selects among visible edges alone, and a
        // response's cardinality is a function of the masked view.
        let mut edges: Vec<_> = Neighbourhood::of(self, view.proof())
            .incident(source.row.get())
            .into_iter()
            .collect();

        let complete = edges.len() <= limits.edges as usize;
        if !complete {
            self.truncate_nearest(&mut edges, limits.edges as usize, source, view.cut());
        }

        edges.sort_unstable_by_key(|&(_, id)| id);

        // Partners derive from the delivered edge set. Distinct rows
        // carry distinct wire ids (the codec is a bijection), so
        // adjacent dedup after the wire-keyed sort is exact.
        let positions_of_row = self.positions_of_row();
        let mut partners: Vec<_> = edges
            .iter()
            .flat_map(|&(edge, _)| [edge.source, edge.target])
            .filter(|&row| row != source.row.get())
            .map(|row| (self.node_codec.encode(row), row))
            .collect();
        partners.sort_unstable();
        partners.dedup();

        let mut rows = IdVec::with_capacity(partners.len() + 1);
        let mut delivered = IdVec::with_capacity(partners.len() + 1);
        rows.push(source.row.get());
        delivered.push(source.position);
        for &(_, row) in &partners {
            rows.push(row);
            delivered.push(positions_of_row[row]);
        }

        LocateSubgraph {
            rows,
            positions: delivered,
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
    /// The zoom reads `cut`, so under a scoped view the tie-break ranks partners by that view's
    /// own cascade and which authorized partners survive the cap is a function of the visible
    /// rows alone.
    fn truncate_nearest(
        &self,
        edges: &mut Vec<(DeliveredEdge, ArchivedEntityId)>,
        cap: usize,
        source: SourcePoint,
        cut: Option<ScheduleCut<'_>>,
    ) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let positions = self.positions();
        let positions_of_row = self.positions_of_row();
        let origin = positions[source.position];

        let mut ranked: Vec<(NearestKey, (DeliveredEdge, ArchivedEntityId))> = edges
            .drain(..)
            .map(|(edge, id)| {
                let partner = edge.partner_of(source.row.get());

                let position = positions_of_row[partner];
                let point = positions[position];
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
                        // A partner the view's schedule does not hold cedes to every partner it
                        // does. The proof admitted each of these rows, so the schedule built over
                        // that proof holds them and the fallback never selects.
                        zoom: self.first_visible_zoom(cut, position).unwrap_or(u8::MAX),
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

/// One assembled locate ego-graph.
///
/// The delivered nodes (source first, then partners ascending wire row id) and the capped edge
/// set among them.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct LocateSubgraph {
    /// The delivered node rows, in delivered order.
    pub rows: IdVec<NodeSlot, NodeRowId>,
    /// The delivered base positions, parallel to `rows`.
    pub positions: IdVec<NodeSlot, BasePosition>,
    /// The delivered edges paired with their link-entity identities, ascending by those bytes.
    pub edges: Vec<(DeliveredEdge, ArchivedEntityId)>,
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
    /// The request names a feature this build does not serve.
    ///
    /// The carried name is the request field.
    Unsupported(&'static str),
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
            Self::Unsupported(feature) => {
                write!(fmt, "this build does not serve {feature} requests")
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
/// The document owns its columns, so it crosses thread boundaries between assembly, hydration, and
/// encoding. The envelope places hydration last, and the split mirrors it. Assembly and encoding
/// are CPU-bound, and hydration awaits the store between them.
#[derive(Debug)]
pub(crate) struct LocateDocument {
    source: SourcePoint,
    delivered: IdVec<NodeSlot, BasePosition>,
    rows: IdVec<NodeSlot, NodeRowId>,
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
    /// the one hydration order this call places, and every label resolves in process from the
    /// generation's own payloads, keyed on the answer's resolution columns.
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

        let node_labels = nodes
            .rows()
            .iter_enumerated()
            .map(|(slot, &row)| {
                if hydration.nodes.resolved.contains(slot) {
                    self.node_ids
                        .payload_of(row)
                        .expect("open validated the identity rows against the code column")
                } else {
                    Label::empty()
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
            .rows()
            .iter()
            .zip(&hydration.links.properties)
            .map(|(&row, properties)| {
                if properties.is_some() {
                    self.edge_ids
                        .payload_of(row)
                        .expect("open validated the identity rows against the adjacency's edges")
                } else {
                    Label::empty()
                }
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
    fn assemble_locate(
        &self,
        request: &LocateRequest,
        limits: ServeLimits,
        view: &View<'_>,
    ) -> Result<LocateDocument, LocateError> {
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
            rows,
            positions,
            edges,
            complete,
        } = self.locate_subgraph(source, limits.locate, view);

        let palette = Palette::of(&request.colored_type_ids);
        let mask_set = (!palette.is_empty()).then(|| self.resolve_masks(&palette));

        Ok(LocateDocument {
            source,
            delivered: positions,
            rows,
            edges: EdgeColumns::of(&self.node_codec, &edges),
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
        document: &'doc LocateDocument,
    ) -> DeliveredNodes<'doc> {
        DeliveredNodes::new(self.node_ids.ids(), &document.rows)
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
        document: &LocateDocument,
        nodes: &LocateNodeDetails,
        links: &LocateLinkDetails,
    ) -> Vec<u8> {
        let masks = document
            .mask_set
            .as_ref()
            .map(|set| set.memberships(&self.postings));

        // The source's identity always travels in HEAD, and the
        // per-edge link identities are first-class columns. Both read
        // the generation-frozen tables in process.
        let entity_id = self
            .node_ids
            .id(document.rows[NodeSlot::new(0)])
            .expect("open validated the identity rows against the code column");

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

/// Node first-type references into one response's type table, delivered order.
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
/// The table is the bytewise-sorted, deduplicated rendering of each node's first direct type and
/// each link's capped type list. Node references are the first-type indexes (`None` for a node
/// without a recorded type). Link references keep the hydration layer's canonical type order.
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
