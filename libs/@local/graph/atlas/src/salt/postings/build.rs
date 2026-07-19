//! The postings build: from the row-order type column to the file's
//! regions.

use std::io;

use smallvec::SmallVec;

use crate::{
    dataset::OntologyRowId,
    file::postings::write::write_regions,
    integrity::{Sha256, Sha256Digest, Writer},
};

/// Configuration of the postings representation split.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PostingsConfig {
    /// A type's membership goes dense when its member count exceeds
    /// `N >> dense_threshold_log2`. The default 5 (one in 32) is the
    /// size-equality point - one list entry costs 32 bitmap bits - so
    /// a dense run is never larger than the list it replaces; the
    /// word-parallel OR already wins work at half that density. At
    /// exact equality the list wins: it reads without bit decoding.
    pub dense_threshold_log2: u8 = 5,
}

const impl Default for PostingsConfig {
    fn default() -> Self {
        Self { .. }
    }
}

/// Building the postings failed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum PostingsError {
    /// A node row's direct types name an ontology row outside the type
    /// domain.
    NodeType { row: u32, id: u64 },
    /// A type's direct parents name an ontology row outside the type
    /// domain.
    Parent { type_row: u32, id: u64 },
}

impl core::fmt::Display for PostingsError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::NodeType { row, id } => write!(
                fmt,
                "node row {row} names ontology row {id}, outside the type domain",
            ),
            Self::Parent { type_row, id } => write!(
                fmt,
                "type {type_row} names parent ontology row {id}, outside the type domain",
            ),
        }
    }
}

impl core::error::Error for PostingsError {}

/// The type postings of one generation, in writable form.
///
/// Construction picks each type's representation and lays every region
/// out exactly as the file stores it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Postings {
    /// The base-position domain `N`.
    points: u64,
    /// One bit per type, set when the type's run is a dense bitmap.
    flags: Vec<u64>,
    /// `T + 1` membership fenceposts over [`Self::entries`].
    membership_posts: Vec<u64>,
    /// The membership entries, type-major: sorted positions for list
    /// types, `ceil(N/32)` bitmap words for dense types.
    entries: Vec<u32>,
    /// `T + 1` parent fenceposts over [`Self::parent_ids`].
    parent_posts: Vec<u64>,
    /// The direct parent rows, type-major, ascending per type.
    parent_ids: Vec<u32>,
}

impl Postings {
    /// Builds the postings over the finished lod permutation.
    ///
    /// `types` holds each node row's direct types in **row** order,
    /// exactly as the dataset streams them (ascending, deduplicated);
    /// `row_of_position` is the lod's gather order, so membership
    /// lands in base delivery order. `parents` holds each ontology
    /// row's direct parents in ontology-row order - the dataset's
    /// `Ontology::parents` contract, restated in file shape - and its
    /// length is the type domain `T`. Walking positions ascending
    /// makes every list run sorted by construction: no sort pass
    /// exists.
    ///
    /// # Errors
    ///
    /// Returns [`PostingsError`] when a row's direct types or a type's
    /// parents name an ontology row outside the type domain.
    ///
    /// # Panics
    ///
    /// Panics when `types` and `row_of_position` cover different row
    /// counts - the lod build already rejected mismatched columns, so
    /// a disagreement here is a producer bug.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the Result carries domain errors; mismatched columns are a caller contract \
                  violation, documented under Panics"
    )]
    pub(crate) fn build(
        types: &[SmallVec<OntologyRowId, 2>],
        row_of_position: &[u32],
        parents: &[SmallVec<OntologyRowId, 2>],
        config: PostingsConfig,
    ) -> Result<Self, PostingsError> {
        assert_eq!(
            types.len(),
            row_of_position.len(),
            "the type column covers one entry per base position",
        );

        let points = types.len() as u64;
        let domain = parents.len();

        // Member counts first: they pick each type's representation
        // and become the fenceposts, so entries land in place below.
        let mut counts = vec![0_u64; domain];
        for (row, list) in types.iter().enumerate() {
            for &id in list {
                let type_row = in_domain(id, domain).ok_or_else(|| PostingsError::NodeType {
                    row: u32::try_from(row).expect("the lod columns index rows by u32"),
                    id: id.get(),
                })?;
                counts[type_row] += 1;
            }
        }

        let dense_words = points.div_ceil(u64::from(u32::BITS));
        let threshold = points >> config.dense_threshold_log2;

        let mut flags = vec![0_u64; domain.div_ceil(u64::BITS as usize)];
        let mut membership_posts = Vec::with_capacity(domain + 1);
        membership_posts.push(0);
        let mut total = 0_u64;
        for (type_row, &count) in counts.iter().enumerate() {
            if count > threshold && dense_words < count {
                flags[type_row >> 6] |= 1 << (type_row & 63);
                total += dense_words;
            } else {
                total += count;
            }
            membership_posts.push(total);
        }

        // Fill in position order: each list run's cursor starts at its
        // fencepost and ascending positions land ascending in place;
        // dense runs set their position bit in place.
        let mut entries =
            vec![0_u32; usize::try_from(total).expect("resident entries fit the address space")];
        let mut cursors: Vec<u64> = membership_posts[..domain].to_vec();
        for (position, &row) in row_of_position.iter().enumerate() {
            for &id in &types[row as usize] {
                let type_row =
                    usize::try_from(id.get()).expect("the counting pass validated the domain");
                if flags[type_row >> 6] & (1 << (type_row & 63)) != 0 {
                    let base = usize::try_from(membership_posts[type_row])
                        .expect("resident entries fit the address space");
                    entries[base + (position >> 5)] |= 1 << (position & 31);
                } else {
                    let slot = usize::try_from(cursors[type_row])
                        .expect("resident entries fit the address space");
                    entries[slot] =
                        u32::try_from(position).expect("the lod columns index rows by u32");
                    cursors[type_row] += 1;
                }
            }
        }

        let (parent_posts, parent_ids) = parent_regions(parents)?;

        Ok(Self {
            points,
            flags,
            membership_posts,
            entries,
            parent_posts,
            parent_ids,
        })
    }

    /// Measures the publish evidence over the finished regions.
    ///
    /// The measurements the manifest records so the threshold knob is
    /// revised from data, not taste: how many types the split sent
    /// dense, and the region populations behind the artifact's size.
    #[must_use]
    pub(crate) fn evidence(&self) -> PostingsEvidence {
        PostingsEvidence {
            types: self.membership_posts.len() as u64 - 1,
            dense_types: self
                .flags
                .iter()
                .map(|&word| u64::from(word.count_ones()))
                .sum(),
            membership_entries: self.entries.len() as u64,
            parent_edges: self.parent_ids.len() as u64,
        }
    }

    /// Writes the postings as a postings file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the
    /// repository records for the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        write_regions(
            self.points,
            &self.flags,
            &self.membership_posts,
            &self.entries,
            &self.parent_posts,
            &self.parent_ids,
            &mut writer,
        )?;

        Ok(writer.accumulator.finalize())
    }
}

/// The publish evidence of one postings build: measurements the
/// manifest records so the configuration is revised from data, not
/// taste.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PostingsEvidence {
    /// Types in the domain.
    pub types: u64,
    /// Types whose membership went dense under the threshold.
    pub dense_types: u64,
    /// Entries in the membership region: list positions plus dense
    /// bitmap words.
    pub membership_entries: u64,
    /// Direct parent edges in the type graph.
    pub parent_edges: u64,
}

/// Lays the parent regions out in file shape.
///
/// The regions restate the dataset's stream; the domain check is the
/// one condition the stream cannot carry itself (parents may point
/// forward).
fn parent_regions(
    parents: &[SmallVec<OntologyRowId, 2>],
) -> Result<(Vec<u64>, Vec<u32>), PostingsError> {
    let domain = parents.len();

    let mut posts = Vec::with_capacity(domain + 1);
    posts.push(0);
    let mut ids = Vec::new();
    for (type_row, list) in parents.iter().enumerate() {
        for &id in list {
            let parent = in_domain(id, domain).ok_or_else(|| PostingsError::Parent {
                type_row: u32::try_from(type_row).expect("type domains stay far below u32"),
                id: id.get(),
            })?;
            ids.push(u32::try_from(parent).expect("checked against the type domain"));
        }
        posts.push(ids.len() as u64);
    }

    Ok((posts, ids))
}

/// Returns `id` as a type-domain index, [`None`] when it lies outside
/// the domain.
fn in_domain(id: OntologyRowId, domain: usize) -> Option<usize> {
    usize::try_from(id.get()).ok().filter(|&row| row < domain)
}
