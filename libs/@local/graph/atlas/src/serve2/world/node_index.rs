use core::ops::Index;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, encoding::Encoding, error::WorldError};
use crate::{
    identity::{BasePosition, Column, NodeRowId},
    postgres::id::ArchivedEntityId,
    salt::fit::prepare::identity::IdentityTableArchive,
};

#[derive(Debug)]
pub struct NodeIndex {
    identity: IdentityTableArchive<ArchivedEntityId, NodeRowId>,
    encoding: Encoding<NodeRowId>,

    lookup: Column<BasePosition, NodeRowId>,
    reverse: Column<NodeRowId, BasePosition>,
}

impl NodeIndex {
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

        let encoding = lookup.map(|column: Column<BasePosition, NodeRowId>| {
            (Encoding::open(options, column.view()), column)
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

    pub(crate) fn lookup(&self, index: BasePosition) -> Option<NodeRowId> {
        self.lookup.view().get(index).copied()
    }

    pub(crate) fn reverse(&self, index: NodeRowId) -> Option<BasePosition> {
        self.reverse.view().get(index).copied()
    }

    pub(crate) fn len(&self) -> usize {
        self.lookup.len()
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
        serve2::{
            tests::fixture::{NODES, TamperFixture, secret, shorten_entities, shorten_u32_column},
            world::{OpenOptions, error::WorldError},
        },
    };

    /// Open refuses a node identity table short of the position columns, under
    /// [`WorldError::NodeIndexCountMismatch`].
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

    /// Open refuses a position-of-row column short of the node identity table, under
    /// [`WorldError::NodeIndexCountMismatch`].
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

    /// Open refuses a published file rewritten in place, under [`WorldError::Open`] from
    /// [`IntegrityVerificationError::Checksum`].
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

    /// Open refuses a generation missing a published file, under [`WorldError::Open`] from
    /// [`IntegrityVerificationError::Io`].
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
