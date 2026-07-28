//! The locate endpoint.
//!
//! Source resolution, ego-graph assembly, and the request/assembly/encode surface.
//!
//! Locate answers the source's ego-graph: every edge incident to the source whose other endpoint
//! is visible, and the partners those edges connect. Assembly is one adjacency probe plus column
//! gathers - no spatial index stands behind it. Locate IS the detail view: the trailer always
//! rides, so serving locate requires a store connection for hydration.

use hashql_core::id::Id as _;
use type_system::ontology::id::VersionedUrl;

use super::{
    Atlas, Filter, TileCoordinate, WireRow,
    colour::Palette,
    grid,
    hydrate::{DeliveredEntities, LocateLinkDetails, LocateNodeDetails, SimpleValue},
    intern::{self, Table},
    neighbourhood::{DeliveredEdge, Neighbourhood},
    scope::ScopeReach,
    visibility::{VisibilityProof, VisibleRow},
};
use crate::{
    dataset::ArchivedEntityId,
    identity::{EdgeRowId, NodeRowId},
    morton::MortonKey,
    salt::wire::locate::{LocateResponse, LocateTrailer, PropertyValue},
};

/// The locate endpoint's limits.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct LocateLimits {
    /// Most ego-graph edges one response delivers.
    ///
    /// A larger incident set keeps the edges whose partners lie nearest the source, and HEAD
    /// reports `complete: false`. Defaults to 512: every delivered edge also costs live link
    /// hydration, so the cap bounds the store round trip, not just wire bytes.
    pub edges: u32 = 512,
    /// Most properties the source ships.
    ///
    /// An over-cap entity drops properties reverse-lexicographically by base URL with its label
    /// property protected to the very end, so the label survives every cap that admits at least
    /// one property. Defaults to 10.
    pub properties: u32 = 10,
    /// Most direct types one delivered edge ships.
    ///
    /// An over-cap link truncates its type list in canonical order and its completeness bit
    /// reads unset. Defaults to 5.
    pub link_type_ids: u32 = 5,
    /// Most properties one delivered edge ships.
    ///
    /// The source's drop rule per link. Defaults to 10.
    pub link_properties: u32 = 10,
}

const impl Default for LocateLimits {
    fn default() -> Self {
        Self { .. }
    }
}

/// One resolved locate source: the subject's identity in every domain a locate response speaks.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct SourcePoint {
    /// The node row id.
    pub row: VisibleRow,
    /// The base position behind the row.
    pub position: u32,
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
    pub(super) fn resolve_source(
        &self,
        proof: &VisibilityProof,
        entity_id: &str,
    ) -> Option<SourcePoint> {
        let id = super::translate::parse(entity_id)?;
        let row = self.node_ids.row_of(id)?;
        let row = proof.verify(row)?;

        Some(self.source_point(row))
    }

    /// Resolves a locate source named by its wire node row id.
    ///
    /// The identifier a rendered tile put in the client's hand.
    ///
    /// Ingress rides [`Atlas::resolve`] - the same keyed codec as egress, so the lookup is pure
    /// arithmetic, no store round trip. [`None`] for out-of-universe values and for rows the proof
    /// hides, collapsed at the seam before any caller observes the cause.
    pub(super) fn resolve_wire_source(
        &self,
        proof: &VisibilityProof,
        wire: WireRow<NodeRowId>,
    ) -> Option<SourcePoint> {
        Some(self.source_point(self.resolve(proof, wire)?))
    }

    /// Returns the first zoom whose cumulative schedule delivers a base position.
    fn first_visible_zoom(&self, position: u32) -> u8 {
        // The position's bucket is its fencepost segment; the cut rule inverted answers the
        // first delivering zoom.
        self.grid
            .first_zoom(self.morton.bucket_of(u64::from(position)))
    }

    /// Answers a proven-visible node row's identity in every domain a locate response speaks.
    ///
    /// Base position, first visible zoom, and fly-to tile.
    fn source_point(&self, row: VisibleRow) -> SourcePoint {
        let position = self.positions_of_row()[row.get().as_usize()];
        let zoom = self.first_visible_zoom(position);

        let key = MortonKey::from_bits(self.morton.codes()[position as usize].get());
        let cell = grid::tile_of(key, zoom);

        SourcePoint {
            row,
            position,
            zoom,
            cell,
        }
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
    pub(super) fn locate_subgraph(
        &self,
        source: SourcePoint,
        limits: LocateLimits,
        proof: &VisibilityProof,
    ) -> LocateSubgraph {
        // Hidden partners drop before selection: the cap selects among visible edges alone, and
        // a response's cardinality is a function of the masked view.
        let mut edges = Neighbourhood::of(self, proof).incident(source.row.get());

        let complete = edges.len() <= limits.edges as usize;
        if !complete {
            self.truncate_nearest(&mut edges, limits.edges as usize, source);
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

        let mut rows = vec![source.row.get()];
        let mut delivered = vec![source.position];
        for &(_, row) in &partners {
            rows.push(row);
            delivered.push(positions_of_row[row.as_usize()]);
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
    fn truncate_nearest(
        &self,
        edges: &mut Vec<(DeliveredEdge, ArchivedEntityId)>,
        cap: usize,
        source: SourcePoint,
    ) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let positions = self.positions();
        let positions_of_row = self.positions_of_row();
        let origin = positions[source.position as usize];

        let mut ranked: Vec<(NearestKey, (DeliveredEdge, ArchivedEntityId))> = edges
            .drain(..)
            .map(|(edge, id)| {
                let partner = edge.partner_of(source.row.get());

                let position = positions_of_row[partner.as_usize()];
                let point = positions[position as usize];
                let (dx, dy) = (point.x() - origin.x(), point.y() - origin.y());
                // The selection key is pinned to unfused f32
                // arithmetic so independent derivations from the wire
                // coordinates agree bit for bit. Squared distances
                // are non-negative finite floats, whose bit patterns
                // order exactly as their values do.
                #[expect(
                    clippy::suboptimal_flops,
                    reason = "a fused mul_add rounds differently and reorders near-ties"
                )]
                let distance = (dx * dx + dy * dy).to_bits();

                (
                    NearestKey {
                        distance,
                        zoom: self.first_visible_zoom(position),
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
/// The derived order is the selection rule: ascending squared distance to the partner, then the
/// partner's first visible zoom, then the link-entity identity bytes.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct NearestKey {
    /// The squared wire-frame distance to the partner, by its bit pattern.
    ///
    /// Non-negative finite floats order by bits exactly as by value.
    distance: u32,
    /// The partner's first visible zoom: equidistant partners cede to the earlier-visible one.
    zoom: u8,
    /// The link-entity identity: distinct identities make the key a total order.
    identity: ArchivedEntityId,
}

/// One assembled locate ego-graph.
///
/// The delivered nodes (source first, then partners ascending wire row id) and the capped edge
/// set among them.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct LocateSubgraph {
    /// The delivered node rows, in delivered order.
    pub rows: Vec<NodeRowId>,
    /// The delivered base positions, parallel to `rows`.
    pub positions: Vec<u32>,
    /// The delivered edges paired with their link-entity identities, ascending by those bytes.
    pub edges: Vec<(DeliveredEdge, ArchivedEntityId)>,
    /// Whether every qualifying edge is delivered; `false` iff the cap truncated.
    pub complete: bool,
}

/// One locate request: the source entity and the delivery knobs.
///
/// The source is named in exactly one of two domains: `entityId` (the upstream identity a search
/// result or deep link carries) XOR `row` (the wire node row id a rendered tile put in the client's
/// hand). The fields are distinct JSON types, so the union is unambiguous; carrying both or neither
/// is rejected by name.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LocateRequest {
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
    /// Versioned type URLs conditioning the `TYPE_MASK` column; absent or empty omits it.
    ///
    /// Also the `typeIdsComplete` reference set: the flag reads `true` exactly when these ids
    /// cover the source's direct types. Entries parse at the transport boundary: a malformed URL
    /// rejects the body, while a well-formed URL this generation never ingested is legal and
    /// reads zero bits.
    #[serde(default)]
    #[schemars(with = "Vec<String>")]
    pub colored_type_ids: Vec<VersionedUrl>,
    /// The visibility filter, a reserved field: a request that carries one is rejected.
    #[serde(default)]
    pub filter: Option<Filter>,
}

/// A locate request the atlas rejects, by name.
///
/// Every variant is a named, data-carrying rejection for the transport layer to map onto its error
/// vocabulary.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum LocateError {
    /// The bound scope does not reach this surface.
    ///
    /// The ego graph is a link-bearing answer - it delivers the source's incident edges and the
    /// partners they reach - and a restricted scope carries no statement about link rows, so the
    /// request is refused before the request body is read at all: the variant precedes every
    /// other rejection, and no rejection past it is reachable out of scope.
    OutOfScope,
    /// The source id does not name a visible node - nonexistent.
    ///
    /// Denied, and unparsable are IDENTICAL by doctrine (missing = denied; an id that cannot name
    /// an entity is an entity that does not exist). An out-of-universe wire `row` collapses here
    /// too: one body, whatever the input domain.
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
}

impl core::fmt::Display for LocateError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::OutOfScope => {
                fmt.write_str("the locate surface is not served in the caller's scope")
            }
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
        }
    }
}

impl core::error::Error for LocateError {}

/// One assembled locate response: everything [`Atlas::encode_locate`] needs.
///
/// The document owns its columns, so it crosses thread boundaries between assembly, hydration, and
/// encoding - the envelope was designed for hydration-last, and the split mirrors it: assembly and
/// encoding are CPU-bound, hydration awaits the store between them.
#[derive(Debug)]
pub struct LocateDocument {
    source: SourcePoint,
    delivered: Vec<u32>,
    rows: Vec<NodeRowId>,
    sources: Vec<WireRow<NodeRowId>>,
    targets: Vec<WireRow<NodeRowId>>,
    /// The delivered edges' link-entity identities, delivered order.
    edge_ids: Vec<ArchivedEntityId>,
    /// The internal edge rows behind `edge_ids`, delivered order.
    ///
    /// The hydration key the identity table speaks.
    internal_rows: Vec<EdgeRowId>,
    complete: bool,
    mask_set: Option<super::colour::MaskSet>,
    /// The request's parsed palette: the `typeIdsComplete` reference set.
    palette: Palette,
}

impl Atlas {
    /// Assembles one locate request into its owned document.
    ///
    /// Every rejection happens here, so encoding cannot fail.
    ///
    /// The `coloredTypeIds` cap is the tile endpoint's own - one manifest key,
    /// `limits.coloredTypeIds`, governs the field wherever it appears.
    ///
    /// Version 0 serves the full unfiltered set; a request naming a visibility filter is rejected
    /// by name rather than answered with bytes that silently ignore it.
    ///
    /// The surface is link-bearing, so it answers `reach` before it reads the request: a
    /// restricted scope is refused here rather than at the transport, and the refusal is a
    /// [`Result`] variant, so no caller can hold a refusal and a document together.
    ///
    /// # Errors
    ///
    /// Returns [`LocateError::OutOfScope`] when `reach` does not serve the link-bearing surfaces,
    /// [`LocateError::Source`] when the body does not name exactly one of `entityId` and
    /// `row`, [`LocateError::UnknownEntity`] when the source does not resolve to a visible node,
    /// [`LocateError::Types`] when the request carries more `coloredTypeIds` than
    /// `limits.tile.colored_type_ids`, and [`LocateError::Unsupported`] when the request names a
    /// version-0 deferral.
    pub fn assemble_locate(
        &self,
        request: &LocateRequest,
        limits: super::ServeLimits,
        proof: &VisibilityProof,
        reach: ScopeReach,
    ) -> Result<LocateDocument, LocateError> {
        if !reach.serves_links() {
            return Err(LocateError::OutOfScope);
        }
        if request.filter.is_some() {
            return Err(LocateError::Unsupported("filter"));
        }
        if request.colored_type_ids.len() > limits.tile.colored_type_ids as usize {
            return Err(LocateError::Types {
                count: request.colored_type_ids.len(),
                maximum: limits.tile.colored_type_ids,
            });
        }

        // The two source forms resolve through different ingress  paths but land in the same
        // SourcePoint domain, and every failure past this match is one rejection:
        // unknown-entity.
        let source = match (request.entity_id.as_deref(), request.row) {
            (Some(id), None) => self.resolve_source(proof, id),
            (None, Some(wire)) => self.resolve_wire_source(proof, wire),
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
        } = self.locate_subgraph(source, limits.locate, proof);

        let mut sources = Vec::with_capacity(edges.len());
        let mut targets = Vec::with_capacity(edges.len());
        let mut edge_ids = Vec::with_capacity(edges.len());
        let mut internal_rows = Vec::with_capacity(edges.len());
        for &(edge, id) in &edges {
            sources.push(self.node_codec.encode(edge.source));
            targets.push(self.node_codec.encode(edge.target));
            edge_ids.push(id);
            internal_rows.push(edge.row);
        }

        let palette = Palette::of(&request.colored_type_ids);
        let mask_set = (!palette.is_empty()).then(|| self.resolve_masks(&palette));

        Ok(LocateDocument {
            source,
            delivered: positions,
            rows,
            sources,
            targets,
            edge_ids,
            internal_rows,
            complete,
            mask_set,
            palette,
        })
    }

    /// Gathers the entity identities behind the document's delivered nodes, in delivered order.
    ///
    /// The node hydration request's subject.
    ///
    /// # Panics
    ///
    /// Panics when the identity table contradicts the row column, which open's cross-artifact
    /// validation rules out.
    #[must_use]
    pub fn locate_node_entities(&self, document: &LocateDocument) -> DeliveredEntities {
        let ids = document
            .rows
            .iter()
            .map(|&row| {
                self.node_ids
                    .id(row)
                    .expect("open validated the identity rows against the code column")
            })
            .collect();

        DeliveredEntities::new(ids)
    }

    /// Gathers the link-entity identities behind the document's delivered edges, in edge order.
    ///
    /// The link hydration request's subject.
    ///
    /// # Panics
    ///
    /// Panics when the identity table contradicts the adjacency's edge domain, which open's
    /// cross-artifact validation rules out.
    #[must_use]
    pub fn locate_link_entities(&self, document: &LocateDocument) -> DeliveredEntities {
        let ids = document
            .internal_rows
            .iter()
            .map(|&row| {
                self.edge_ids
                    .id(row)
                    .expect("open validated the identity rows against the adjacency's edges")
            })
            .collect();

        DeliveredEntities::new(ids)
    }

    /// Encodes an assembled document with its hydrated details.
    ///
    /// `SALTILEL` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`. Locate is
    /// the detail view, so the trailer always rides and hydrated details are required.
    ///
    /// The trailer interns type and property URLs at encode time: each table is the
    /// bytewise-sorted union of every reference the trailer makes, and every reference keys by
    /// index into it - the per-entity ascending-name order the hydration layer produces IS
    /// ascending index order, so the wire laws hold by construction. The source's `HEAD` flags
    /// derive here: `typeIdsComplete` tests the source's direct types against the request's
    /// `coloredTypeIds`, and `propertiesComplete` echoes the hydration layer's whole-set
    /// attestation.
    ///
    /// # Panics
    ///
    /// Panics when supplied details do not cover the document's delivered nodes and edges - a
    /// transport bug, never request data.
    #[must_use]
    pub fn encode_locate(
        &self,
        document: &LocateDocument,
        nodes: &LocateNodeDetails,
        links: &LocateLinkDetails,
    ) -> Vec<u8> {
        let masks = document
            .mask_set
            .as_ref()
            .map(|set| set.memberships(&self.postings));

        // The source's identity always rides HEAD; the per-edge link
        // identities are first-class columns. Both read the
        // generation-frozen tables, no store.
        let entity_id = self
            .node_ids
            .id(document.rows[0])
            .expect("open validated the identity rows against the code column");

        let type_ids_complete = covers_source_types(
            nodes.source_properties().is_some(),
            &nodes.type_urls()[0],
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

        let link_properties: Vec<Option<&[(u32, PropertyValue<'_>)]>> =
            link_property_maps.iter().map(Option::as_deref).collect();

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
            sources: &document.sources,
            targets: &document.targets,
            edge_ids: &document.edge_ids,
            trailer: LocateTrailer {
                type_table: type_table.entries(),
                property_table: property_table.entries(),
                labels: &intern::borrowed(nodes.labels()),
                type_ids: &type_ids,
                properties: source_properties.as_deref(),
                link_labels: &intern::borrowed(links.labels()),
                link_type_ids: &link_type_ids,
                link_type_ids_complete: links.type_urls_complete(),
                link_properties: &link_properties,
                link_properties_complete: links.properties_complete(),
            },
        }
        .encode()
    }
}

/// One entity's wire property map.
///
/// Uint indexes into the property table paired with borrowed values, ascending by index. `None`
/// marks an entity the store no longer serves.
type PropertyMapView<'doc> = Option<Vec<(u32, PropertyValue<'doc>)>>;

/// Returns whether a request's palette covers the source's direct types.
///
/// The `typeIdsComplete` predicate: every direct type of the source names a palette entry.
/// Coverage compares parsed ontology identities, the same parse the `TYPE_MASK` resolution
/// applies. `false` when the store no longer serves the source (`present` reads false) or
/// records no types for it - coverage of an unreadable set is never attested - and on a palette
/// with no resolvable entry, which covers nothing.
pub(super) fn covers_source_types(present: bool, types: &[String], palette: &Palette) -> bool {
    present && !types.is_empty() && types.iter().all(|url| palette.covers(url))
}

/// Builds the type intern table and every type reference into it.
///
/// The table is the bytewise-sorted, deduplicated union of each node's first direct type and
/// each link's capped type list. Node references are the first-type indexes (`None` for a node
/// without a recorded type); link references keep the hydration layer's canonical type order.
pub(super) fn intern_types<'doc>(
    nodes: &'doc [Vec<String>],
    links: &'doc [Vec<String>],
) -> (Table<'doc>, Vec<Option<u32>>, Vec<Vec<u32>>) {
    let table = Table::new(
        nodes
            .iter()
            .filter_map(|urls| urls.first())
            .chain(links.iter().flatten())
            .map(String::as_str),
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

/// Builds the property intern table and the per-entity uint-index maps.
///
/// The table is the bytewise-sorted, deduplicated union of the source's and every link's
/// surviving names; the returned maps lead with the source's, then the links' in edge order. Each
/// map keeps the hydration layer's ascending-name order, which maps to ascending indexes.
pub(super) fn intern_properties<'doc>(
    source: Option<&'doc Vec<(String, SimpleValue)>>,
    links: &'doc [Option<Vec<(String, SimpleValue)>>],
) -> (Table<'doc>, Vec<PropertyMapView<'doc>>) {
    let sets: Vec<Option<&[(String, SimpleValue)]>> = core::iter::once(source.map(Vec::as_slice))
        .chain(links.iter().map(|entry| entry.as_deref()))
        .collect();

    let table = Table::new(
        sets.iter()
            .flatten()
            .flat_map(|entries| entries.iter().map(|(name, _)| name.as_str())),
    );

    let maps = sets
        .iter()
        .map(|entry| {
            entry.map(|survivors| {
                survivors
                    .iter()
                    .map(|(name, value)| (table.index_of(name), wire_value(value)))
                    .collect()
            })
        })
        .collect();

    (table, maps)
}

/// Views one hydrated value in the wire's borrowed form.
const fn wire_value(value: &SimpleValue) -> PropertyValue<'_> {
    match value {
        SimpleValue::Text(text) => PropertyValue::Text(text.as_str()),
        SimpleValue::Integer(value) => PropertyValue::Integer(*value),
        SimpleValue::Float(value) => PropertyValue::Float(*value),
        SimpleValue::Boolean(flag) => PropertyValue::Boolean(*flag),
        SimpleValue::Null => PropertyValue::Null,
    }
}
