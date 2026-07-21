//! The locate endpoint.
//!
//! The spatial neighbour index, source resolution, and the request/assembly/encode surface.
//!
//! The index is kiddo's exact two-dimensional kd-tree over the wire positions column, built eagerly
//! at open so no first request pays for it, and cached on disk keyed by generation id so a restart
//! against the same generation loads instead of rebuilding (ruling 2026-07-20). The cache is a
//! cache: any read failure - missing, foreign magic, corrupt bytes - falls back to a fresh build
//! and a best-effort rewrite, never a failed open.

use camino::{Utf8Path, Utf8PathBuf};
use kiddo::{SquaredEuclidean, immutable::float::kdtree::ImmutableKdTree};

use super::{
    Atlas, Filter, TileCoordinate, depth_of,
    detail::{DeliveredEntities, LinkDetails, LocateNodeDetails, SimpleValue},
    edges::{DeliveredEdge, borrow},
    narrow,
    visibility::{VisibilityProof, VisibleRow},
};
use crate::{
    bitset::BitSet,
    file::generation::GenerationId,
    math::Vec2,
    morton::{Depth, MortonKey},
    salt::wire::locate::{LocateResponse, LocateTrailer, PropertyValue},
};

/// The cache file magic: pins the codec (rkyv 0.8) and the tree's type parameters.
///
/// A mismatch after a dependency upgrade reads as foreign and rebuilds.
const CACHE_MAGIC: &[u8; 8] = b"SALTKDX1";

/// The exact spatial index behind locate's neighbour selection.
///
/// Item index = base position, so lookups answer in the positions column's own domain.
#[derive(Debug)]
pub(super) struct LocateIndex {
    tree: ImmutableKdTree<f32, u32, 2, 32>,
}

impl LocateIndex {
    /// Builds the index from the positions column.
    fn build(positions: &[Vec2]) -> Self {
        let points: Vec<[f32; 2]> = positions
            .iter()
            .map(|position| [position.x(), position.y()])
            .collect();

        Self {
            tree: ImmutableKdTree::new_from_slice(&points),
        }
    }

    /// Loads the generation's cached index, or builds it and leaves the cache behind for the next
    /// open.
    ///
    /// Without a cache directory the build is unconditional; with one, the file is keyed by
    /// generation id, so distinct generations never collide and a stale entry cannot be mistaken
    /// for current.
    pub(super) fn load_or_build(
        cache: Option<&Utf8Path>,
        generation: GenerationId,
        positions: &[Vec2],
    ) -> Self {
        let Some(directory) = cache else {
            return Self::build(positions);
        };
        let path = directory.join(format!("locate-{generation}.kdtree"));

        if let Some(index) = Self::read(&path) {
            return index;
        }

        let index = Self::build(positions);
        index.write(directory, &path);
        index
    }

    /// Reads one cache file; any failure reads as a miss.
    fn read(path: &Utf8Path) -> Option<Self> {
        let bytes = std::fs::read(path).ok()?;
        let payload = bytes.strip_prefix(CACHE_MAGIC)?;

        // rkyv access requires alignment the heap read does not
        // guarantee; the copy restores it.
        let mut aligned = rkyv::util::AlignedVec::<16>::new();
        aligned.extend_from_slice(payload);

        match rkyv::from_bytes::<ImmutableKdTree<f32, u32, 2, 32>, rkyv::rancor::Error>(&aligned) {
            Ok(tree) => Some(Self { tree }),
            Err(error) => {
                tracing::warn!(%path, %error, "the locate index cache is corrupt; rebuilding");
                None
            }
        }
    }

    /// Writes the cache file; failures warn and serve proceeds - the cache is never load-bearing.
    fn write(&self, directory: &Utf8Path, path: &Utf8Path) {
        let result = std::fs::create_dir_all(directory).and_then(|()| {
            let bytes =
                rkyv::to_bytes::<rkyv::rancor::Error>(&self.tree).map_err(std::io::Error::other)?;
            let mut payload = Vec::with_capacity(CACHE_MAGIC.len() + bytes.len());
            payload.extend_from_slice(CACHE_MAGIC);
            payload.extend_from_slice(&bytes);
            std::fs::write(path, payload)
        });

        if let Err(error) = result {
            tracing::warn!(%path, %error, "the locate index cache did not persist");
        }
    }

    /// Collects every base position that can be among the `count` nearest around `origin`.
    ///
    /// All points at or under the k-nearest boundary distance, unordered, boundary ties included.
    ///
    /// The k-nearest query alone would leave boundary ties to the tree's internal order: co-located
    /// points are real (fit collision clusters), and which of them crosses a cut must follow the
    /// wire's own tie-break - (distance, node row id), a domain this index does not speak - not the
    /// index's. The query therefore only fixes the boundary DISTANCE - the multiset of returned
    /// distances is tie-independent - and a second, radius query hands the caller every candidate
    /// for the exact selection.
    pub(super) fn candidates(
        &self,
        origin: [f32; 2],
        count: core::num::NonZero<usize>,
    ) -> Vec<(f32, u32)> {
        let boundary = self
            .tree
            .nearest_n::<SquaredEuclidean>(&origin, count)
            .into_iter()
            .map(|neighbour| neighbour.distance)
            .max_by(f32::total_cmp);
        let Some(boundary) = boundary else {
            return Vec::new();
        };

        self.tree
            .within_unsorted::<SquaredEuclidean>(&origin, boundary)
            .into_iter()
            .map(|neighbour| (neighbour.distance, neighbour.item))
            .collect()
    }
}

/// The locate endpoint's caps.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct LocateCaps {
    /// Largest neighbour budget one request may name; requests over it clamp to it.
    ///
    /// The documented default is 32 (ratified 2026-07-20, amended from 64).
    pub neighbours: u32,
    /// Most subgraph edges one response delivers.
    ///
    /// A larger subgraph truncates by rank with source-incident edges protected, and HEAD reports
    /// `complete: false`. The documented default is 512 (ratified 2026-07-20, replacing the vetoed
    /// uncapped draft - every delivered edge also costs live link hydration, so the cap bounds the
    /// store round trip, not just wire bytes).
    pub edges: u32,
    /// Most properties one delivered entity ships.
    ///
    /// An over-cap entity drops properties reverse-lexicographically by base URL with its label
    /// property protected to the very end, so the label survives every cap that admits at least
    /// one property. The documented default is 20 (Q5, ratified 2026-07-19).
    pub properties: u32,
}

impl Default for LocateCaps {
    fn default() -> Self {
        Self {
            neighbours: 32,
            edges: 512,
            properties: 20,
        }
    }
}

/// The options one serving open takes.
///
/// Configuration travels as a struct, never constants or bare parameters (ruling 2026-07-20).
#[derive(Debug, Clone)]
pub struct OpenOptions {
    /// The locate index cache directory; [`None`] builds the index on every open.
    pub locate_cache: Option<Utf8PathBuf>,
    /// The server secret behind the wire row-id codec.
    ///
    /// The keyed permutation derives from it per generation at open.
    ///
    /// The default is a fixed development value: wire ids stay deterministic across restarts
    /// without configuration, and a production deployment supplies its own secret. The secret
    /// never rotates for a generation while it serves; rotation happens at generation boundaries.
    pub wire_secret: Vec<u8>,
}

impl Default for OpenOptions {
    fn default() -> Self {
        Self {
            locate_cache: None,
            wire_secret: b"atlas-dev-wire-secret".to_vec(),
        }
    }
}

/// One resolved locate source: the subject's identity in every domain a locate response speaks.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct SourcePoint {
    /// The node row id.
    pub row: u32,
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
        let row = proof.verify(narrow(self.node_ids.row_of(id)?))?;
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
        wire: u32,
    ) -> Option<SourcePoint> {
        Some(self.source_point(self.resolve(proof, wire)?))
    }

    /// Answers a proven-visible node row's identity in every domain a locate response speaks.
    ///
    /// Base position, first visible zoom, and fly-to tile.
    fn source_point(&self, row: VisibleRow) -> SourcePoint {
        let row = row.get();
        let position = self.positions_of_row()[row as usize];

        // The position's fencepost segment is its morton bucket; the
        // cumulative cut rule (bucket <= z + span_log2) then answers
        // the first delivering zoom.
        let bucket = (0..=Depth::MAX.get())
            .find(|&bucket| {
                self.morton
                    .fenceposts()
                    .segment(depth_of(bucket))
                    .contains(&u64::from(position))
            })
            .expect("every base position lies in exactly one bucket segment");
        let zoom = bucket.saturating_sub(self.lod.span_log2);

        let key = MortonKey::from_bits(self.morton.codes()[position as usize].get());
        let [x, y] = key.coordinates();
        let cell = if zoom == 0 {
            TileCoordinate { z: 0, x: 0, y: 0 }
        } else {
            TileCoordinate {
                z: zoom,
                x: x >> (32 - u32::from(zoom)),
                y: y >> (32 - u32::from(zoom)),
            }
        };

        SourcePoint {
            row,
            position,
            zoom,
            cell,
        }
    }

    /// Assembles the locate subgraph around a resolved source.
    ///
    /// The delivered node set and the capped edge set among it.
    ///
    /// Delivered order is the wire's pin: the source first, then its nearest neighbours ascending
    /// by (distance, wire row id). Edges are the edges endpoint's rule over this small set (both
    /// endpoints delivered, each edge exactly once), ascending wire edge row after the cap.
    pub(super) fn locate_subgraph(
        &self,
        source: SourcePoint,
        neighbours: u32,
        caps: LocateCaps,
        proof: &VisibilityProof,
    ) -> LocateSubgraph {
        let budget = neighbours.min(caps.neighbours) as usize;

        // The exact selection follows the wire's own (distance, wire
        // row id) order, so a co-located cluster crosses the budget
        // cut by a client-observable key - never by tree shape, and
        // never by internal id order, which the wire codec exists to
        // hide.
        let mut candidates = self.visible_candidates(source, budget, proof);
        candidates.sort_unstable_by(
            |(left_distance, left_wire, ..), (right_distance, right_wire, ..)| {
                left_distance
                    .total_cmp(right_distance)
                    .then(left_wire.cmp(right_wire))
            },
        );
        candidates.truncate(budget);

        let row_ids = self.row_ids();

        let mut delivered: Vec<u32> = vec![source.position];
        let mut rows: Vec<u32> = vec![source.row];
        for &(_, _, row, position) in &candidates {
            delivered.push(position);
            rows.push(row);
        }

        let mut in_set = BitSet::new(row_ids.len());
        for &row in &rows {
            in_set.insert(row as usize);
        }
        let mut edges: Vec<(DeliveredEdge, u32)> = self
            .qualifying_edges(&in_set)
            .into_iter()
            .map(|edge| (edge, self.edge_codec.encode(edge.row).get()))
            .collect();
        let complete = edges.len() <= caps.edges as usize;
        if !complete {
            self.truncate_protecting_source(&mut edges, caps.edges as usize, source.row);
        }
        edges.sort_unstable_by_key(|&(_, wire)| wire);

        LocateSubgraph {
            rows,
            positions: delivered,
            edges,
            complete,
        }
    }

    /// Collects every visible point that can be among the `budget` nearest visible neighbours of
    /// the source: `(distance, wire row, row, position)` per candidate, unordered, boundary ties
    /// included.
    ///
    /// The k-nearest boundary is searched over ALL points, so under a mask the query expands -
    /// doubling its k until the boundary encloses `budget` visible non-source points or the whole
    /// universe has been seen. Selection therefore happens under the mask: hidden points never
    /// consume the budget, and a response's cardinality is a function of the masked view alone.
    fn visible_candidates(
        &self,
        source: SourcePoint,
        budget: usize,
        proof: &VisibilityProof,
    ) -> Vec<(f32, u32, u32, u32)> {
        let row_ids = self.row_ids();
        let wire_rows = self.wire_rows();
        let universe = self.positions().len();
        let origin = {
            let origin = self.positions()[source.position as usize];
            [origin.x(), origin.y()]
        };

        // The source is its own nearest point at distance zero, so
        // the query asks for one extra and drops it wherever it
        // surfaces. The boundary distance covers every point the
        // budget can admit (the budget-th non-source distance never
        // exceeds the (budget + 1)-th overall).
        let mut want = budget + 1;
        loop {
            let count = core::num::NonZero::new(want).expect("budget + 1 is nonzero");
            let candidates: Vec<(f32, u32, u32, u32)> = self
                .locate
                .candidates(origin, count)
                .into_iter()
                .filter(|&(_, position)| {
                    position != source.position && proof.contains(row_ids[position as usize])
                })
                .map(|(distance, position)| {
                    (
                        distance,
                        wire_rows[position as usize],
                        row_ids[position as usize],
                        position,
                    )
                })
                .collect();

            if candidates.len() >= budget || want >= universe {
                return candidates;
            }
            want = (want * 2).min(universe);
        }
    }

    /// Keeps the `cap` edges the protected rank order selects.
    ///
    /// Source-incident edges strictly before context edges, then ascending worse-endpoint rank,
    /// ties by wire edge row (ruling 2026-07-20 - the spotlight's primary information is how the
    /// source connects, so neighbour-neighbour context truncates first).
    fn truncate_protecting_source(
        &self,
        edges: &mut Vec<(DeliveredEdge, u32)>,
        cap: usize,
        source_row: u32,
    ) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let mut ranked: Vec<(ProtectedKey, (DeliveredEdge, u32))> = edges
            .drain(..)
            .map(|(edge, wire)| {
                let context = edge.source != source_row && edge.target != source_row;
                ((context, self.worse_rank(edge), wire), (edge, wire))
            })
            .collect();
        // Partitioning at `cap - 1` places the cap smallest keys - a
        // total order, since wire edge ids are distinct - in the head.
        ranked.select_nth_unstable_by_key(cap - 1, |&(key, _)| key);
        ranked.truncate(cap);
        edges.extend(ranked.into_iter().map(|(_, entry)| entry));
    }
}

/// The protected truncation's sort key.
///
/// Context edges after source-incident ones, then ascending worse-endpoint rank, then ascending
/// wire edge id.
type ProtectedKey = (bool, u32, u32);

/// One assembled locate subgraph.
///
/// The delivered nodes (source first, then neighbours in wire order) and the capped edge set among
/// them.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct LocateSubgraph {
    /// The delivered node rows, in delivered order.
    pub rows: Vec<u32>,
    /// The delivered base positions, parallel to `rows`.
    pub positions: Vec<u32>,
    /// The delivered edges paired with their wire edge ids, ascending by wire edge id.
    pub edges: Vec<(DeliveredEdge, u32)>,
    /// Whether every qualifying edge is delivered; `false` iff the cap truncated.
    pub complete: bool,
}

/// One locate request: the source entity and the delivery knobs.
///
/// The source is named in exactly one of two domains: `entityId` (the upstream identity a search
/// result or deep link carries) XOR `row` (the wire node row id a rendered tile put in the client's
/// hand). The fields are distinct JSON types, so the union is unambiguous; carrying both or neither
/// is rejected by name.
///
/// `neighbours` is a budget, not a list: a value over the cap CLAMPS to it (the clamp is visible in
/// `HEAD.count`), where the list-caps reject - a budget has no elements to refuse.
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
    pub row: Option<u32>,
    /// The type ids whose membership masks ride `TYPE_MASK`; absent or empty omits the slot.
    #[serde(default)]
    pub colored_type_ids: Vec<String>,
    /// The visibility filter; absent means the trivial bitmap.
    #[serde(default)]
    pub filter: Option<Filter>,
    /// The neighbour budget; absent means the cap itself.
    #[serde(default)]
    pub neighbours: Option<u32>,
    /// Whether the detail trailer rides the response.
    ///
    /// Locate IS the detail view, so unlike every other endpoint it defaults TRUE.
    #[serde(default = "detailed_by_default")]
    pub include_detailed_data: bool,
}

/// Locate's `includeDetailedData` default: true.
const fn detailed_by_default() -> bool {
    true
}

/// A locate request the atlas rejects, by name.
///
/// Every variant is a named, data-carrying rejection for the transport layer to map onto its error
/// vocabulary.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum LocateError {
    /// The source id does not name a visible node - nonexistent, denied, and unparsable are
    /// IDENTICAL by doctrine (missing = denied; an id that cannot name an entity is an entity that
    /// does not exist). An out-of-universe wire `row` collapses here too: one body, whatever the
    /// input domain.
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
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::UnknownEntity => {
                formatter.write_str("the entity id does not name a visible node")
            }
            Self::Source { carried } => {
                write!(
                    formatter,
                    "the request carries {carried} source fields where exactly one of entityId \
                     and row names the subject"
                )
            }
            Self::Types { count, maximum } => {
                write!(
                    formatter,
                    "the request carries {count} coloredTypeIds where the cap admits {maximum}"
                )
            }
            Self::Unsupported(feature) => {
                write!(formatter, "this build does not serve {feature} requests")
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
    rows: Vec<u32>,
    sources: Vec<u32>,
    targets: Vec<u32>,
    edge_rows: Vec<u32>,
    /// The internal edge rows behind `edge_rows`, delivered order.
    ///
    /// The hydration key the identity table speaks.
    internal_rows: Vec<u32>,
    complete: bool,
    mask_set: Option<super::color::MaskSet>,
}

impl Atlas {
    /// Answers one locate request.
    ///
    /// `SALTILEL` envelope bytes spotlighting the source and its nearest neighbours, ready to send
    /// under `application/vnd.hash.saltile-v1`.
    ///
    /// A request that sets `includeDetailedData` - which locate DEFAULTS to - is rejected by name:
    /// this path serves deployments without a store connection. A transport with one assembles,
    /// hydrates, and encodes through [`Atlas::assemble_locate`], [`Atlas::locate_node_entities`],
    /// [`Atlas::locate_link_entities`], and [`Atlas::encode_locate`].
    ///
    /// # Errors
    ///
    /// As [`Atlas::assemble_locate`], plus [`LocateError::Unsupported`] when the request sets (or
    /// defaults) `includeDetailedData`.
    pub fn locate(
        &self,
        request: &LocateRequest,
        caps: super::ServeCaps,
        proof: &VisibilityProof,
    ) -> Result<Vec<u8>, LocateError> {
        if request.include_detailed_data {
            return Err(LocateError::Unsupported("includeDetailedData"));
        }

        let document = self.assemble_locate(request, caps, proof)?;
        Ok(self.encode_locate(&document, None))
    }

    /// Assembles one locate request into its owned document.
    ///
    /// Every rejection happens here, so encoding cannot fail.
    ///
    /// The neighbour budget is `request.neighbours` clamped to `caps.locate.neighbours` (absent
    /// means the cap itself); the clamp is visible in `HEAD.count`. The `coloredTypeIds` cap is the
    /// tile endpoint's own - one manifest key, `limits.coloredTypeIds`, governs the field wherever
    /// it appears.
    ///
    /// Version 0 serves the full unfiltered set; a request naming a visibility filter is rejected
    /// by name rather than answered with bytes that silently ignore it.
    ///
    /// # Errors
    ///
    /// Returns [`LocateError::Source`] when the body does not name exactly one of `entityId` and
    /// `row`, [`LocateError::UnknownEntity`] when the source does not resolve to a visible node,
    /// [`LocateError::Types`] when the request carries more `coloredTypeIds` than
    /// `caps.tile.colored_type_ids`, and [`LocateError::Unsupported`] when the request names a
    /// version-0 deferral.
    pub fn assemble_locate(
        &self,
        request: &LocateRequest,
        caps: super::ServeCaps,
        proof: &VisibilityProof,
    ) -> Result<LocateDocument, LocateError> {
        if request.filter.is_some() {
            return Err(LocateError::Unsupported("filter"));
        }
        if request.colored_type_ids.len() > caps.tile.colored_type_ids as usize {
            return Err(LocateError::Types {
                count: request.colored_type_ids.len(),
                maximum: caps.tile.colored_type_ids,
            });
        }

        // The two source forms resolve through different ingress
        // paths but land in the same SourcePoint domain, and every
        // failure past this match is one rejection: unknown-entity.
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
        let budget = request.neighbours.unwrap_or(caps.locate.neighbours);
        let LocateSubgraph {
            rows,
            positions,
            edges,
            complete,
        } = self.locate_subgraph(source, budget, caps.locate, proof);

        let mut sources = Vec::with_capacity(edges.len());
        let mut targets = Vec::with_capacity(edges.len());
        let mut edge_rows = Vec::with_capacity(edges.len());
        let mut internal_rows = Vec::with_capacity(edges.len());
        for &(edge, wire) in &edges {
            sources.push(self.node_codec.encode(edge.source).get());
            targets.push(self.node_codec.encode(edge.target).get());
            edge_rows.push(wire);
            internal_rows.push(edge.row);
        }

        let mask_set = (!request.colored_type_ids.is_empty())
            .then(|| self.resolve_masks(&request.colored_type_ids));

        Ok(LocateDocument {
            source,
            delivered: positions,
            rows,
            sources,
            targets,
            edge_rows,
            internal_rows,
            complete,
            mask_set,
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
                    .id(u64::from(row))
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
                    .id(u64::from(row))
                    .expect("open validated the identity rows against the adjacency's edges")
            })
            .collect();

        DeliveredEntities::new(ids)
    }

    /// Encodes an assembled document.
    ///
    /// `SALTILEL` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`, with the
    /// detail trailer riding iff `details` is supplied.
    ///
    /// The trailer interns property names at encode time: the table is the bytewise-sorted union of
    /// every delivered node's surviving names, and each node's map keys by index into it - the
    /// per-entity ascending-name order the hydration layer produces IS ascending index order, so
    /// the wire laws hold by construction.
    ///
    /// # Panics
    ///
    /// Panics when supplied details do not cover the document's delivered nodes and edges - a
    /// transport bug, never request data.
    #[must_use]
    pub fn encode_locate(
        &self,
        document: &LocateDocument,
        details: Option<(&LocateNodeDetails, &LinkDetails)>,
    ) -> Vec<u8> {
        let masks = document
            .mask_set
            .as_ref()
            .map(|set| set.memberships(&self.postings));

        let hydrated = details.map(|(nodes, links)| {
            let (names, properties) = intern_properties(nodes.properties());
            HydratedColumns {
                labels: borrow(nodes.labels()),
                icons: borrow(nodes.icons()),
                names,
                properties,
                link_labels: borrow(links.labels()),
                link_icons: borrow(links.icons()),
                link_type_labels: borrow(links.type_labels()),
                link_type_icons: borrow(links.type_icons()),
            }
        });
        let property_maps: Option<Vec<PropertyMapView<'_>>> = hydrated
            .as_ref()
            .map(|columns| columns.properties.iter().map(Option::as_deref).collect());
        let trailer = hydrated
            .as_ref()
            .zip(property_maps.as_ref())
            .map(|(columns, properties)| LocateTrailer {
                labels: &columns.labels,
                icons: &columns.icons,
                property_names: &columns.names,
                properties,
                link_labels: &columns.link_labels,
                link_icons: &columns.link_icons,
                link_type_labels: &columns.link_type_labels,
                link_type_icons: &columns.link_type_icons,
            });

        LocateResponse {
            generation: self.generation.id().digest(),
            variant: 0,
            cell: document.source.cell,
            complete: document.complete,
            delivered: &document.delivered,
            positions: self.positions(),
            rows: self.wire_rows(),
            masks: masks.as_deref(),
            sources: &document.sources,
            targets: &document.targets,
            edge_rows: &document.edge_rows,
            trailer,
        }
        .encode()
    }
}

/// One node's wire property map.
///
/// Uint indexes into the intern table paired with borrowed values, ascending by index. `None` marks
/// an entity the store no longer serves.
type PropertyMap<'doc> = Option<Vec<(u32, PropertyValue<'doc>)>>;

/// The encoder's borrowed view of one [`PropertyMap`].
type PropertyMapView<'doc> = Option<&'doc [(u32, PropertyValue<'doc>)]>;

/// The trailer's owned hydration columns, borrowed from the detail structs for the encoder's
/// lifetime.
#[derive(Debug)]
struct HydratedColumns<'doc> {
    labels: Vec<Option<&'doc str>>,
    icons: Vec<Option<&'doc str>>,
    names: Vec<&'doc str>,
    properties: Vec<PropertyMap<'doc>>,
    link_labels: Vec<Option<&'doc str>>,
    link_icons: Vec<Option<&'doc str>>,
    link_type_labels: Vec<Option<&'doc str>>,
    link_type_icons: Vec<Option<&'doc str>>,
}

/// Builds the property-name intern table and the per-node uint-index maps: the table is the
/// bytewise-sorted, deduplicated union of every surviving name; each node's entries keep the
/// hydration layer's ascending-name order, which maps to ascending indexes.
pub(super) fn intern_properties(
    entries: &[Option<Vec<(String, SimpleValue)>>],
) -> (Vec<&str>, Vec<PropertyMap<'_>>) {
    let mut names: Vec<&str> = entries
        .iter()
        .flatten()
        .flatten()
        .map(|(name, _)| name.as_str())
        .collect();
    names.sort_unstable();
    names.dedup();

    let maps = entries
        .iter()
        .map(|entry| {
            entry.as_ref().map(|survivors| {
                survivors
                    .iter()
                    .map(|(name, value)| {
                        let index = names
                            .binary_search(&name.as_str())
                            .expect("every surviving name is interned");
                        let index =
                            u32::try_from(index).expect("the table is far below u32::MAX names");

                        (index, wire_value(value))
                    })
                    .collect()
            })
        })
        .collect();

    (names, maps)
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
