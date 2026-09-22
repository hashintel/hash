//! Registers the codecs used to read and write durable records.
//!
//! Each [`DurableRecord`] has a [`RecordDeclaration`] with its stored name,
//! format version, ID algorithm versions, and rules for upgrading stored records.
//! A [`RecordRegistry`] rejects conflicting declarations for the same name, including
//! their codec identities. A kernel shares its registry with its readers and writers.
//! Applications must keep stored formats compatible across builds.
//!
//! [`crate::domain`] supplies these declarations for application events and snapshots. Custom
//! records implement [`DurableRecord`] and register through [`RecordRegistry::register`].

use alloc::collections::BTreeMap;
use std::{
    io::Write,
    sync::{PoisonError, RwLock},
};

use error_stack::Report;
use serde::{Deserialize, Serialize};

use crate::{domain::PartitionKey, ids::EventId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DurabilityClass {
    ImmutableJournal,
    ImmutableArtifact,
    MutableCas,
    Derived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MigrationPolicy {
    NeverRetireWhileUntrimmed,
    PureUpcast,
    MutableCas,
    Rebuild,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AlgorithmVersion {
    pub name: &'static str,
    pub version: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// The stored name, supported versions, and compatibility rules for a record type.
///
/// A name identifies one declaration within a [`RecordRegistry`]. Registering different codecs
/// or version rules under an existing name fails.
pub struct RecordDeclaration {
    pub name: &'static str,
    /// Identifies the codec within this process. Use `TypeId::of::<RecordType>()`.
    pub codec: core::any::TypeId,
    pub owning_module: &'static str,
    pub emitted_version: u32,
    pub supported_versions: &'static [u32],
    pub algorithm_versions: &'static [AlgorithmVersion],
    pub durability: DurabilityClass,
    pub migration: MigrationPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[error(ignore)]
pub enum DeclarationError {
    #[display("journal {name:?} must retain its decoders, but declares {migration:?}")]
    InvalidJournalMigration {
        name: &'static str,
        migration: MigrationPolicy,
    },
    #[display("record name {:?} is already registered with a different declaration", requested.name)]
    ConflictingDeclaration {
        registered: RecordDeclaration,
        requested: RecordDeclaration,
    },
    #[display("record {name:?} declares migration policy {actual:?}, expected {expected:?}")]
    MigrationMismatch {
        name: &'static str,
        expected: MigrationPolicy,
        actual: MigrationPolicy,
    },
    #[display("record {name:?} is not registered")]
    Unregistered { name: &'static str },
}

/// Owns the record declarations shared by a kernel's readers and writers.
#[derive(Debug, Default)]
pub struct RecordRegistry {
    declarations: RwLock<BTreeMap<&'static str, RecordDeclaration>>,
}

impl RecordRegistry {
    /// Registers a declaration. Repeating an identical registration succeeds.
    ///
    /// # Errors
    ///
    /// Returns an error if the name has a different declaration or a journal declaration allows
    /// removal of decoders for stored records.
    pub fn register(&self, declaration: RecordDeclaration) -> Result<(), Report<DeclarationError>> {
        if declaration.migration != MigrationPolicy::NeverRetireWhileUntrimmed
            && declaration.durability == DurabilityClass::ImmutableJournal
        {
            return Err(Report::new(DeclarationError::InvalidJournalMigration {
                name: declaration.name,
                migration: declaration.migration,
            }));
        }
        let mut declarations = self
            .declarations
            .write()
            .unwrap_or_else(PoisonError::into_inner);
        if let Some(existing) = declarations.get(declaration.name) {
            return if *existing == declaration {
                Ok(())
            } else {
                Err(Report::new(DeclarationError::ConflictingDeclaration {
                    registered: *existing,
                    requested: declaration,
                }))
            };
        }
        declarations.insert(declaration.name, declaration);
        drop(declarations);
        Ok(())
    }

    /// Checks that the record type has a matching registered declaration.
    ///
    /// # Errors
    ///
    /// Returns an error if the declaration is absent, differs from the registered declaration,
    /// or disagrees with the type's migration policy.
    pub fn require<T: DurableRecord>(&self) -> Result<(), Report<DeclarationError>> {
        let declaration = T::declaration();
        if T::MIGRATION_POLICY != declaration.migration {
            return Err(Report::new(DeclarationError::MigrationMismatch {
                name: declaration.name,
                expected: declaration.migration,
                actual: T::MIGRATION_POLICY,
            }));
        }
        let declarations = self
            .declarations
            .read()
            .unwrap_or_else(PoisonError::into_inner);
        match declarations.get(declaration.name) {
            Some(registered) if *registered == declaration => Ok(()),
            Some(registered) => Err(Report::new(DeclarationError::ConflictingDeclaration {
                registered: *registered,
                requested: declaration,
            })),
            None => Err(Report::new(DeclarationError::Unregistered {
                name: declaration.name,
            })),
        }
    }
}

pub trait DurableRecord: Sized {
    fn declaration() -> RecordDeclaration;
    const MIGRATION_POLICY: MigrationPolicy;

    /// Encodes the record in its declared wire format.
    ///
    /// # Errors
    ///
    /// Returns an error when the record cannot be encoded under its declared format.
    fn encode<W: Write>(&self, writer: W) -> Result<(), Report<CompatError>>;

    /// Decodes bytes into a supported wire record.
    ///
    /// # Errors
    ///
    /// Returns an error when the bytes are malformed or use an unsupported record format.
    fn decode(bytes: &[u8]) -> Result<Self, Report<CompatError>>;
}

/// Converts supported wire versions to one validated record type. Add a conversion here for
/// each new wire version.
pub trait VersionedRecord: DurableRecord {
    type Current;

    /// Converts a wire record to its validated current representation.
    ///
    /// # Errors
    ///
    /// Returns an error when the wire record cannot be converted to a valid current record.
    fn normalize(self) -> Result<Self::Current, Report<CompatError>>;
}

/// Keeps stored bytes readable by converting supported versions to the current record type.
pub trait PureUpcastRecord: VersionedRecord {}

/// Keeps decoders for every record version that journal recovery can read.
pub trait UntrimmedJournalRecord: VersionedRecord {}

/// Upgrades mutable records to the current format. Writes must use compare-and-swap against the
/// version that was read.
pub trait MutableCasRecord: VersionedRecord + Send + Sync {
    /// Builds a wire record from the current representation.
    ///
    /// # Errors
    ///
    /// Returns an error when the current record cannot be represented in the emitted format.
    fn from_current(current: Self::Current) -> Result<Self, Report<CompatError>>;

    /// Converts a record to the format used for new writes.
    ///
    /// # Errors
    ///
    /// Returns an error when normalization or conversion to the emitted format fails.
    fn into_emitted(self) -> Result<Self, Report<CompatError>> {
        Self::from_current(self.normalize()?)
    }
}

/// Records that can be discarded and rebuilt from their source data.
pub trait RebuildableRecord: DurableRecord {}

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum CompatError {
    #[display("unsupported {name} version {version:?}")]
    UnsupportedVersion { name: &'static str, version: String },
    #[display("{name} could not be encoded")]
    Encode { name: &'static str },
    #[display("{name} could not be decoded")]
    Decode { name: &'static str },
    #[display("{name} is {actual_bytes} bytes; maximum is {max_bytes}")]
    TooLarge {
        name: &'static str,
        actual_bytes: usize,
        max_bytes: usize,
    },
    #[display("{name} record partition {actual} does not match the event's partition {expected}")]
    PartitionMismatch {
        name: &'static str,
        expected: PartitionKey,
        actual: PartitionKey,
    },
    #[display("{name} event ID mismatch: expected {expected}, found {actual}")]
    EventIdMismatch {
        name: &'static str,
        expected: EventId,
        actual: EventId,
    },
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use error_stack::Report;

    use super::{
        CompatError, DeclarationError, DurabilityClass, DurableRecord, MigrationPolicy,
        RecordDeclaration, RecordRegistry,
    };

    const fn declaration(name: &'static str) -> RecordDeclaration {
        RecordDeclaration {
            name,
            codec: core::any::TypeId::of::<()>(),
            owning_module: "durable_kernel::registry::tests",
            emitted_version: 1,
            supported_versions: &[1],
            algorithm_versions: &[],
            durability: DurabilityClass::ImmutableJournal,
            migration: MigrationPolicy::NeverRetireWhileUntrimmed,
        }
    }

    struct TestRecord<const VERSION: u32>;

    impl<const VERSION: u32> DurableRecord for TestRecord<VERSION> {
        const MIGRATION_POLICY: MigrationPolicy = if VERSION == 0 {
            MigrationPolicy::PureUpcast
        } else {
            MigrationPolicy::NeverRetireWhileUntrimmed
        };

        fn declaration() -> RecordDeclaration {
            const {
                RecordDeclaration {
                    emitted_version: VERSION,
                    supported_versions: &[VERSION],
                    ..declaration("registry_require_declaration")
                }
            }
        }

        fn encode<W: Write>(&self, _writer: W) -> Result<(), Report<CompatError>> {
            Ok(())
        }

        fn decode(_bytes: &[u8]) -> Result<Self, Report<CompatError>> {
            Ok(Self)
        }
    }

    #[test]
    fn require_registered_declaration() {
        let registry = RecordRegistry::default();
        let error = registry
            .require::<TestRecord<1>>()
            .expect_err("an unregistered record should be rejected");
        assert_eq!(
            error.current_context(),
            &DeclarationError::Unregistered {
                name: TestRecord::<1>::declaration().name,
            }
        );

        registry
            .register(TestRecord::<1>::declaration())
            .expect("declaration should register");
        registry
            .require::<TestRecord<1>>()
            .expect("matching registered declaration should be accepted");

        let error = registry
            .require::<TestRecord<0>>()
            .expect_err("a mismatched migration policy should be rejected");
        assert_eq!(
            error.current_context(),
            &DeclarationError::MigrationMismatch {
                name: TestRecord::<0>::declaration().name,
                expected: MigrationPolicy::NeverRetireWhileUntrimmed,
                actual: MigrationPolicy::PureUpcast,
            }
        );

        let error = registry
            .require::<TestRecord<2>>()
            .expect_err("a conflicting declaration should be rejected");
        assert_eq!(
            error.current_context(),
            &DeclarationError::ConflictingDeclaration {
                registered: TestRecord::<1>::declaration(),
                requested: TestRecord::<2>::declaration(),
            }
        );
    }

    #[test]
    fn registration_conflicting_versions() {
        let registry = RecordRegistry::default();
        let first = declaration("kernel_registry_test_record");
        registry
            .register(first)
            .expect("fresh declaration should register");
        registry
            .register(first)
            .expect("repeat registration should succeed");

        let conflicting = RecordDeclaration {
            emitted_version: 2,
            supported_versions: &[1, 2],
            ..declaration("kernel_registry_test_record")
        };
        let error = registry
            .register(conflicting)
            .expect_err("different versions should conflict with the registered declaration");
        assert_eq!(
            error.current_context(),
            &DeclarationError::ConflictingDeclaration {
                registered: first,
                requested: conflicting,
            }
        );
    }

    #[test]
    fn journal_records_cannot_retire_decoders() {
        let registry = RecordRegistry::default();
        let retiring = RecordDeclaration {
            migration: MigrationPolicy::PureUpcast,
            ..declaration("kernel_registry_retiring_journal")
        };
        let error = registry
            .register(retiring)
            .expect_err("journal declarations should retain their decoders");
        assert_eq!(
            error.current_context(),
            &DeclarationError::InvalidJournalMigration {
                name: retiring.name,
                migration: MigrationPolicy::PureUpcast,
            }
        );
    }
}
