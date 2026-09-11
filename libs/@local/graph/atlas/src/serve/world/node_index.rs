//! The permutation between stable node rows and fitted storage positions.
//!
//! [`NodeRowId`] identifies a node independently of layout order. [`BasePosition`] indexes the
//! geometry and importance columns.

use core::ops::Index;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, encoding::Encoding, error::WorldError};
use crate::{
    dataset::auxiliary::Legend,
    identity::{BasePosition, Column, NodeRowId},
    postgres::id::ArchivedEntityId,
    salt::fit::prepare::identity::IdentityTableArchive,
    serve::{
        codec::{EncodedRowId, RowDomain},
        delta::{
            epoch::Epoch,
            overlay::{NaiveIdentityProvider, VersionedIdentityProvider as _},
        },
    },
};

/// Node identities and the inverse mappings between row and base-position order.
#[derive(Debug)]
pub(crate) struct NodeIndex {
    pub identity: IdentityTableArchive<ArchivedEntityId, NodeRowId>,
    encoding: Encoding<NodeRowId>,

    lookup: Column<BasePosition, NodeRowId>,
    reverse: Column<NodeRowId, BasePosition>,
}

impl NodeIndex {
    /// Opens the identity and permutation artifacts and checks their counts.
    ///
    /// The open bounds the fitted row count by `u32::MAX` before any row encodes, which keeps every
    /// fitted row inside the wire domain `[0, 2^32)`.
    ///
    /// # Errors
    ///
    /// Returns [`WorldError`] for artifact opening, a fitted row count past `u32::MAX` or
    /// mismatched row counts.
    pub(crate) fn open(
        options @ OpenOptions {
            generation,
            secret: _,
        }: OpenOptions<'_>,
    ) -> Result<Self, Report<[WorldError]>> {
        let files = &generation.repository().files;

        let identity = files
            .node_identities
            .open(generation)
            .change_context(WorldError::Open {
                file: files.node_identities.name(),
            });

        let lookup = files
            .row_of_position
            .open(generation)
            .change_context(WorldError::Open {
                file: files.row_of_position.name(),
            });

        let reverse = files
            .position_of_row
            .open(generation)
            .change_context(WorldError::Open {
                file: files.position_of_row.name(),
            });

        let encoding = lookup.and_then(|column: Column<BasePosition, NodeRowId>| {
            let nodes = column.len();
            // `Encoding::open` encodes every fitted row. The codec encodes the rows in `[0, 2^32)`,
            // row `u32::MAX` included. This refusal bounds the count itself by `u32::MAX`, and
            // every fitted row then lies below `u32::MAX`, inside the codec's domain.
            u32::try_from(nodes).map_err(|error| {
                Report::new(error).change_context(WorldError::TooManyNodes { nodes })
            })?;

            Ok((
                Encoding::open(options, RowDomain::from_length(nodes)),
                column,
            ))
        });

        let (identity, (encoding, lookup), reverse) =
            (identity, encoding, reverse).try_collect()?;

        let this = Self {
            identity,
            encoding,
            lookup,
            reverse,
        };

        let mut sink = ReportSink::new_armed();

        if this.identity.len() != this.lookup.len() as u64
            || this.identity.len() != this.reverse.len() as u64
        {
            sink.capture(WorldError::NodeIndexCountMismatch {
                identity: this.identity.len(),
                lookup: this.lookup.len(),
                reverse: this.reverse.len(),
            });
        }

        sink.finish_ok(this)
    }

    /// Returns the entity's row if its identity is live at the captured revision.
    ///
    /// # Panics
    ///
    /// Panics if this index does not belong to the epoch's world.
    pub(crate) fn row_of(&self, epoch: &Epoch, entity_id: ArchivedEntityId) -> Option<NodeRowId> {
        let provider = epoch
            .nodes(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity));

        provider.provide_row_of_at(entity_id, epoch.revision())
    }

    /// Returns the row's entity key if its identity is live at the captured revision.
    ///
    /// # Panics
    ///
    /// Panics if this index does not belong to the epoch's world.
    pub(crate) fn key_of(&self, epoch: &Epoch, row: NodeRowId) -> Option<ArchivedEntityId> {
        let provider = epoch
            .nodes(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity));

        provider.provide_key_of_at(row, epoch.revision())
    }

    /// Borrows the legend of a live node identity at the captured revision.
    ///
    /// # Panics
    ///
    /// Panics if this index does not belong to the epoch's world.
    pub(crate) fn payload<'scene>(
        &'scene self,
        epoch: &'scene Epoch,
        row: NodeRowId,
    ) -> Option<&'scene Legend> {
        epoch
            .nodes(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity))
            .into_payload_of_row_at(row, epoch.revision())
    }

    /// Returns the row at `index`, or [`None`] outside the fitted position domain.
    pub(super) fn base_lookup(&self, index: BasePosition) -> Option<NodeRowId> {
        self.lookup.view().get(index).copied()
    }

    /// Returns a fitted position's row if its identity is live at the captured revision.
    ///
    /// # Panics
    ///
    /// Panics if `index` is in the fitted position domain and this node index does not belong to
    /// the epoch's world.
    pub(crate) fn lookup(&self, epoch: &Epoch, index: BasePosition) -> Option<NodeRowId> {
        let row = self.base_lookup(index)?;

        let provider = epoch
            .nodes(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity));

        provider
            .permits_row(row, Some(epoch.revision()))
            .then_some(row)
    }

    /// Encodes a node row as its wire id, independent of liveness or allocation.
    ///
    /// # Panics
    ///
    /// Panics if `row` lies at or beyond [`WIRE_ROW_BOUND`](crate::serve::codec::WIRE_ROW_BOUND).
    pub(crate) fn encode(&self, row: NodeRowId) -> EncodedRowId<NodeRowId> {
        self.encoding.encode(row)
    }

    /// Decodes rows allocated and live in the supplied [`Epoch`].
    ///
    /// # Panics
    ///
    /// Panics if this index does not belong to `epoch`'s [`World`](super::World).
    pub(crate) fn decode(&self, epoch: &Epoch, wire: EncodedRowId<NodeRowId>) -> Option<NodeRowId> {
        let provider = epoch
            .nodes(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity));
        let row = self.encoding.decode(wire, provider.provide_domain())?;

        provider
            .provide_key_of_at(row, epoch.revision())
            .map(|_key| row)
    }

    /// Returns the fitted position of `index`, or [`None`] outside the fitted row domain.
    pub(super) fn base_reverse(&self, index: NodeRowId) -> Option<BasePosition> {
        self.reverse.view().get(index).copied()
    }

    /// Returns a live node identity's fitted position at the captured revision.
    ///
    /// Returns [`None`] for rows without a fitted position or a live identity.
    ///
    /// # Panics
    ///
    /// Panics if this index does not belong to the epoch's world.
    pub(crate) fn reverse(&self, epoch: &Epoch, index: NodeRowId) -> Option<BasePosition> {
        let provider = epoch
            .nodes(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity));

        let position = self.base_reverse(index)?;
        provider
            .permits_row(index, Some(epoch.revision()))
            .then_some(position)
    }

    pub(crate) fn len(&self) -> usize {
        self.lookup.len()
    }

    pub(crate) fn base_node_bound(&self) -> NodeRowId {
        self.reverse.view().bound()
    }
}

impl Index<BasePosition> for NodeIndex {
    type Output = NodeRowId;

    fn index(&self, index: BasePosition) -> &Self::Output {
        &self.lookup.view()[index]
    }
}

impl Index<NodeRowId> for NodeIndex {
    type Output = BasePosition;

    fn index(&self, index: NodeRowId) -> &Self::Output {
        &self.reverse.view()[index]
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use super::NodeIndex;
    use crate::{
        file::repository::{IntegrityVerificationError, OpenBindingError},
        identity::NodeRowId,
        salt::fit::prepare::identity::OpenIdentityTableArchiveError,
        serve::{
            tests::fixture::{NODES, TamperFixture, secret, shorten_entities, shorten_u32_column},
            world::{OpenOptions, error::WorldError},
        },
    };

    /// Rejects a node identity table shorter than the position columns.
    ///
    /// Returns [`WorldError::NodeIndexCountMismatch`].
    #[test]
    fn node_identities_short() {
        let fixture = TamperFixture::publish("node-index-identities-short");
        let columns = usize::try_from(NODES).expect("fixture node counts fit usize");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.node_identities.name(), |path| {
            shorten_entities::<NodeRowId>(path, NODES - 1, 0);
        });
        let report = NodeIndex::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a short node identity table");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::NodeIndexCountMismatch {
                identity,
                lookup,
                reverse,
            }] if *identity == NODES - 1 && *lookup == columns && *reverse == columns,
        );
    }

    /// Rejects a position-of-row column shorter than the node identity table.
    ///
    /// Returns [`WorldError::NodeIndexCountMismatch`].
    #[test]
    fn row_positions_short() {
        let fixture = TamperFixture::publish("node-index-row-positions-short");
        let columns = usize::try_from(NODES).expect("fixture node counts fit usize");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.position_of_row.name(), |path| {
            shorten_u32_column(path, NODES - 1);
        });
        let report = NodeIndex::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a short position-of-row column");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::NodeIndexCountMismatch {
                identity,
                lookup,
                reverse,
            }] if *identity == NODES && *lookup == columns && *reverse == columns - 1,
        );
    }

    /// Rejects a published file rewritten in place.
    ///
    /// Returns [`WorldError::Open`] from [`IntegrityVerificationError::Checksum`].
    ///
    /// The rewrite keeps the table's format and would fail the count check if it reached it. The
    /// digest check runs first and names the file with both digests.
    #[test]
    fn corruption_rewritten_file() {
        let fixture = TamperFixture::publish("node-index-corruption-rewritten");
        let files = &fixture.generation().repository().files;
        let name = files.node_identities.name();

        shorten_entities::<NodeRowId>(&fixture.generation().path_of(&name), NODES - 1, 0);
        let report = NodeIndex::open(OpenOptions {
            generation: fixture.generation(),
            secret: &secret(),
        })
        .expect_err("open refuses a published file rewritten in place");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::Open { file }] if *file == name,
        );
        assert_matches!(
            report.downcast_ref::<OpenBindingError<OpenIdentityTableArchiveError>>(),
            Some(OpenBindingError::Integrity(IntegrityVerificationError::Checksum {
                file,
                received,
            })) if file.name == name
                && file.hash == files.node_identities.hash()
                && *received != file.hash,
        );
    }

    /// Rejects a generation missing a published file.
    ///
    /// Returns [`WorldError::Open`] from [`IntegrityVerificationError::Io`].
    #[test]
    fn corruption_missing_file() {
        let fixture = TamperFixture::publish("node-index-corruption-missing");
        let name = fixture
            .generation()
            .repository()
            .files
            .node_identities
            .name();

        std::fs::remove_file(fixture.generation().path_of(&name))
            .expect("the published file removes");
        let report = NodeIndex::open(OpenOptions {
            generation: fixture.generation(),
            secret: &secret(),
        })
        .expect_err("open refuses a generation missing a published file");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::Open { file }] if *file == name,
        );
        assert_matches!(
            report.downcast_ref::<OpenBindingError<OpenIdentityTableArchiveError>>(),
            Some(OpenBindingError::Integrity(IntegrityVerificationError::Io {
                name: missing,
                error,
            })) if *missing == name && error.kind() == std::io::ErrorKind::NotFound,
        );
    }
}
