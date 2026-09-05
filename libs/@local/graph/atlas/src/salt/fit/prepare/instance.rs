//! The relation-instance spool, the edge drain's working artifact.
//!
//! The drain consumes the edge stream exactly once, before the policy table exists, so it spools
//! every `(edge, relation)` reading into a scratch file and the relation stage maps that file back
//! once the policy table resolves. The spool is transient by design. It lives in the run's
//! [`ScratchDirectory`], and only the run that wrote it consumes it. It never publishes.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::fmt;
use std::{
    fs::File,
    io::{self, BufWriter, Write as _},
};

use camino::Utf8PathBuf;
use memmap2::Mmap;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U32, Unalign};

use crate::{
    file::generation::ScratchDirectory,
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::UnitFraction,
    salt::relation::{RelationConfidence, RelationInstance},
};

/// One spooled `(edge, relation)` reading.
///
/// Each confidence stores its value beside a presence bit (bit 0 link, bit 1 source, bit 2 target,
/// the attraction file's score vocabulary), so the absent-score distinction survives the spool.
// The confidence fields carry their domains in their types, so the mapping's parse refuses an
// out-of-domain value. The row ids, the presence bits and the multiplicity are unconstrained
// primitive encodings.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct InstanceRecord {
    edge: EdgeRowId,
    relation: OntologyRowId,
    source: NodeRowId,
    target: NodeRowId,
    link: Unalign<UnitFraction>,
    source_confidence: Unalign<UnitFraction>,
    target_confidence: Unalign<UnitFraction>,
    scored: U32<LE>,
    multiplicity: U32<LE>,
}

impl InstanceRecord {
    const LINK: u32 = 1;
    const SOURCE: u32 = 1 << 1;
    const TARGET: u32 = 1 << 2;

    /// Encodes one reading of `edge` under `relation`.
    ///
    /// The confidences carry their domains in their types, entering an absent score as the
    /// neutral [`UnitFraction::ONE`] behind a cleared presence bit. `multiplicity` is the edge's
    /// total reading count: the number of relation types the edge carries, each spooled as its
    /// own record.
    #[must_use]
    pub(crate) const fn new(
        edge: EdgeRowId,
        relation: OntologyRowId,
        source: NodeRowId,
        target: NodeRowId,
        confidence: RelationConfidence,
        multiplicity: u32,
    ) -> Self {
        let mut scored = 0;
        if confidence.link.is_some() {
            scored |= Self::LINK;
        }
        if confidence.source.is_some() {
            scored |= Self::SOURCE;
        }
        if confidence.target.is_some() {
            scored |= Self::TARGET;
        }

        Self {
            edge,
            relation,
            source,
            target,
            link: Unalign::new(confidence.link.unwrap_or(UnitFraction::ONE)),
            source_confidence: Unalign::new(confidence.source.unwrap_or(UnitFraction::ONE)),
            target_confidence: Unalign::new(confidence.target.unwrap_or(UnitFraction::ONE)),
            scored: U32::new(scored),
            multiplicity: U32::new(multiplicity),
        }
    }

    /// Decodes the reading as a relation instance.
    #[must_use]
    pub(crate) fn instance(&self) -> RelationInstance<NodeRowId, EdgeRowId> {
        let scored = self.scored.get();

        RelationInstance {
            edge: self.edge,
            relation: self.relation,
            source: self.source,
            target: self.target,
            confidence: RelationConfidence {
                link: (scored & Self::LINK != 0).then(|| self.link.get()),
                source: (scored & Self::SOURCE != 0).then(|| self.source_confidence.get()),
                target: (scored & Self::TARGET != 0).then(|| self.target_confidence.get()),
            },
            multiplicity: self.multiplicity.get(),
        }
    }
}

impl fmt::Debug for InstanceRecord {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("InstanceRecord")
            .field("edge", &self.edge)
            .field("relation", &self.relation)
            .field("source", &self.source)
            .field("target", &self.target)
            .field("link", &self.link.get())
            .field("source_confidence", &self.source_confidence.get())
            .field("target_confidence", &self.target_confidence.get())
            .field("scored", &self.scored.get())
            .field("multiplicity", &self.multiplicity.get())
            .finish()
    }
}

/// An open spool the edge drain writes readings into.
#[derive(Debug)]
pub(crate) struct InstanceSpoolWriter {
    writer: BufWriter<File>,
    path: Utf8PathBuf,
    count: u64,
}

impl InstanceSpoolWriter {
    /// Creates the spool file under the run's scratch directory.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the spool's subdirectory or the file itself fails.
    pub(crate) fn create(scratch: &ScratchDirectory) -> io::Result<Self> {
        let path = scratch.directory("relation")?.join("instances");

        Ok(Self {
            writer: BufWriter::new(File::create(&path)?),
            path,
            count: 0,
        })
    }

    /// Appends one reading to the spool.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn push(&mut self, record: InstanceRecord) -> io::Result<()> {
        self.writer.write_all(record.as_bytes())?;
        self.count += 1;

        Ok(())
    }

    /// Flushes the spool and seals it into a readable handle.
    ///
    /// # Errors
    ///
    /// Returns an error when the flush fails.
    pub(crate) fn finish(mut self) -> io::Result<InstanceSpool> {
        self.writer.flush()?;

        Ok(InstanceSpool {
            path: self.path,
            count: self.count,
        })
    }
}

/// A finished spool, the handle the relation stage maps back.
#[derive(Debug)]
pub(crate) struct InstanceSpool {
    path: Utf8PathBuf,
    count: u64,
}

impl InstanceSpool {
    /// Returns the number of spooled readings.
    #[inline]
    #[must_use]
    pub(crate) const fn count(&self) -> u64 {
        self.count
    }

    /// Maps the spool read-only.
    ///
    /// An empty spool - an edgeless corpus - maps to zero readings without touching the file, since
    /// a zero-length mapping does not exist.
    ///
    /// # Errors
    ///
    /// Returns an error when opening or mapping the file fails.
    ///
    /// # Panics
    ///
    /// This panics when the file length disagrees with the pushed count. One run writes and
    /// consumes the spool, so a mismatch is a program bug rather than a data error.
    #[tracing::instrument(skip_all)]
    pub(crate) fn map(&self) -> io::Result<MappedInstances> {
        if self.count == 0 {
            return Ok(MappedInstances { map: None });
        }

        let file = File::open(&self.path)?;
        // SAFETY: the run that owns the scratch directory writes the spool once and consumes it
        // there, and nothing rewrites it while mapped.
        let map = unsafe { Mmap::map(&file) }?;

        assert_eq!(
            map.len() as u64,
            self.count * size_of::<InstanceRecord>() as u64,
            "the spool holds exactly the pushed readings",
        );

        Ok(MappedInstances { map: Some(map) })
    }
}

/// A spool mapped read-only into memory.
#[derive(Debug)]
pub(crate) struct MappedInstances {
    map: Option<Mmap>,
}

impl MappedInstances {
    /// Views the spooled readings, in drain order.
    ///
    /// The parse validates each confidence's domain as the bytes are read, so a reading never
    /// decodes to a value its type refuses.
    #[must_use]
    pub(crate) fn records(&self) -> &[InstanceRecord] {
        let Some(map) = &self.map else {
            return &[];
        };

        <[InstanceRecord]>::try_ref_from_bytes(map)
            .expect("the spool holds the records this run wrote, every confidence in its domain")
    }
}

const _: () = assert!(size_of::<InstanceRecord>() == 64);
