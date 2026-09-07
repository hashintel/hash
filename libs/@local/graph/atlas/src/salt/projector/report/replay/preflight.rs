//! Generation compatibility and artifact integrity, checked before any extraction.
//!
//! A replay attributes the whole gap between two generations' readings to later arrivals, so
//! the pair must differ in nothing else it can refuse on. Both placements come from the trained
//! projector. Both fits ran under one embedding contract and one configuration, the seed
//! included. The artifact bytes must also be the bytes the metadata documents bound, because
//! the report's evidence identity is the generation pair's identity.

use camino::Utf8Path;

use super::{Pair, error::ReplayError};
use crate::file::{
    digest_file,
    generation::{Generation, GenerationId},
    repository::RepositoryFile,
    salt::metadata::{Placement, Reproducibility},
};

/// The contract fields one generation publishes, as compatibility reads them.
struct GenerationContract<'doc> {
    /// The generation's identity.
    pub generation: GenerationId,
    /// What placed the generation's coordinates.
    pub placement: Placement,
    /// The declared inputs the generation's fit ran under.
    pub reproducibility: &'doc Reproducibility,
}

impl<'doc> GenerationContract<'doc> {
    /// The contract fields of one generation's metadata document.
    const fn of(generation: &'doc Generation) -> Self {
        let metadata = &generation.repository().metadata;
        Self {
            generation: generation.id(),
            placement: metadata.placement,
            reproducibility: &metadata.reproducibility,
        }
    }
}

/// A generation pair admitted for replay.
///
/// Construction is the admission: the contracts agree and every bound artifact hashes to its
/// metadata record. Everything downstream reaches the generations through this value, so an
/// unadmitted pair cannot be extracted.
pub(super) struct VerifiedPair<'run> {
    earlier: &'run Generation,
    later: &'run Generation,
}

impl<'run> VerifiedPair<'run> {
    /// Admits a pair whose contracts agree and whose artifact bytes match their records.
    ///
    /// Both generations must publish projector placements and share one embedding contract. The
    /// complete fit configuration, the seed included, must also match. The prior lineage is not
    /// compared: the later generation lawfully names a different prior. The predicate is
    /// conservative, and widening it is an experiment-design change that needs its own noise
    /// control first. Every file each metadata document binds is then rehashed against its
    /// record.
    ///
    /// # Errors
    ///
    /// Returns the [`ReplayError`] naming the first violated contract or the first artifact
    /// whose bytes fail integrity, in check order.
    pub(super) fn new(
        Pair { earlier, later }: Pair<&'run Generation>,
    ) -> Result<Self, ReplayError> {
        Pair {
            earlier: GenerationContract::of(earlier),
            later: GenerationContract::of(later),
        }
        .agreed()?;

        for generation in [earlier, later] {
            Self::verified_artifacts(
                generation.id(),
                generation.path(),
                generation.repository().files.files(),
            )?;
        }

        Ok(Self { earlier, later })
    }

    /// The earlier generation `G0`, whose published projector the replay drives.
    pub(super) const fn earlier(&self) -> &'run Generation {
        self.earlier
    }

    /// The later generation `G1`, whose arrivals the replay samples.
    pub(super) const fn later(&self) -> &'run Generation {
        self.later
    }

    /// Recomputes every bound file's digest against the metadata document's record.
    ///
    /// The generation id pins the metadata document alone. The per-file digests inside it are
    /// what bind the artifact bytes. A report whose readings came from bytes the document never
    /// bound would carry the wrong evidence identity under an unchanged generation id.
    ///
    /// # Errors
    ///
    /// Returns [`ReplayError::ArtifactIntegrity`] naming the first file whose bytes hash
    /// elsewhere than recorded, and [`ReplayError::ReadArtifact`] when a bound file fails to
    /// read.
    fn verified_artifacts(
        generation: GenerationId,
        directory: &Utf8Path,
        files: impl IntoIterator<Item = RepositoryFile>,
    ) -> Result<(), ReplayError> {
        for RepositoryFile { name, hash } in files {
            let observed = digest_file(directory.join(name.as_str())).map_err(|source| {
                ReplayError::ReadArtifact {
                    generation,
                    role: name.clone(),
                    source,
                }
            })?;

            if observed != hash {
                return Err(ReplayError::ArtifactIntegrity {
                    generation,
                    role: name,
                    expected: hash,
                    observed,
                });
            }
        }

        Ok(())
    }
}

impl Pair<GenerationContract<'_>> {
    /// The pair-compatibility predicate over two published contracts.
    ///
    /// # Errors
    ///
    /// Returns the [`ReplayError`] naming the first violated contract, in check order.
    fn agreed(&self) -> Result<(), ReplayError> {
        let Self { earlier, later } = self;

        for contract in [earlier, later] {
            if contract.placement != Placement::Projector {
                return Err(ReplayError::NotProjectorPlaced {
                    generation: contract.generation,
                    placement: contract.placement,
                });
            }
        }

        if earlier.reproducibility.embedder != later.reproducibility.embedder {
            return Err(ReplayError::EmbedderMismatch {
                earlier: earlier.generation,
                later: later.generation,
            });
        }
        if earlier.reproducibility.config != later.reproducibility.config {
            return Err(ReplayError::ConfigMismatch {
                earlier: earlier.generation,
                later: later.generation,
            });
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use core::num::NonZero;
    use std::fs;

    use camino::Utf8PathBuf;

    use super::{GenerationContract, Pair, ReplayError, VerifiedPair};
    use crate::{
        file::{
            generation::GenerationId,
            repository::{FileName, RepositoryFile},
            salt::metadata::{Placement, Reproducibility},
        },
        integrity::{Sha256, Sha256Digest, Update as _},
        math::AffinityCurve,
        salt::{
            embedding::EmbedderFingerprint, fit::FitConfig, landmark::select::SelectionOptions,
        },
    };

    fn generation(ordinal: u8) -> GenerationId {
        format!("{ordinal:064x}")
            .parse()
            .expect("a 64-digit hex literal is a generation id")
    }

    /// A fabricated fit configuration, mirroring the generation fixture's.
    fn config(seed: u64) -> FitConfig {
        FitConfig {
            seed,
            selection: SelectionOptions {
                maximum_count: NonZero::new(2).expect("the fixture capacity is nonzero"),
                ..
            },
            curve: AffinityCurve::new(1.577, 0.895)
                .expect("the fixture parameters are finite and strictly positive"),
            ..
        }
    }

    fn digest(seed: &str) -> Sha256Digest {
        let mut hasher = Sha256::new();
        hasher.update(seed.as_bytes());
        hasher.finalize()
    }

    fn reproducibility(config_seed: u64, embedder: &str) -> Reproducibility {
        Reproducibility {
            config: config(config_seed),
            embedder: EmbedderFingerprint::new(digest(embedder)),
            prior: None,
        }
    }

    #[test]
    fn contract_placement() {
        let shared = reproducibility(7, "embedder");
        let result = Pair {
            earlier: GenerationContract {
                generation: generation(1),
                placement: Placement::LandmarkBaseline,
                reproducibility: &shared,
            },
            later: GenerationContract {
                generation: generation(2),
                placement: Placement::Projector,
                reproducibility: &shared,
            },
        }
        .agreed();

        assert!(matches!(
            result,
            Err(ReplayError::NotProjectorPlaced {
                generation: named,
                placement: Placement::LandmarkBaseline,
            }) if named == generation(1),
        ));
    }

    #[test]
    fn contract_embedder() {
        let earlier = reproducibility(7, "embedder");
        let later = reproducibility(7, "another-embedder");
        let result = Pair {
            earlier: GenerationContract {
                generation: generation(1),
                placement: Placement::Projector,
                reproducibility: &earlier,
            },
            later: GenerationContract {
                generation: generation(2),
                placement: Placement::Projector,
                reproducibility: &later,
            },
        }
        .agreed();

        assert!(matches!(result, Err(ReplayError::EmbedderMismatch { .. })));
    }

    #[test]
    fn contract_config() {
        // The seed is part of the complete configuration echo, so a pair
        // differing only there refuses.
        let earlier = reproducibility(7, "embedder");
        let later = reproducibility(8, "embedder");
        let result = Pair {
            earlier: GenerationContract {
                generation: generation(1),
                placement: Placement::Projector,
                reproducibility: &earlier,
            },
            later: GenerationContract {
                generation: generation(2),
                placement: Placement::Projector,
                reproducibility: &later,
            },
        }
        .agreed();

        assert!(matches!(result, Err(ReplayError::ConfigMismatch { .. })));
    }

    #[test]
    fn contract_pass() {
        // The prior lineage lawfully differs, so it is deliberately outside
        // the compared contract.
        let earlier = reproducibility(7, "embedder");
        let mut later = reproducibility(7, "embedder");
        later.prior = Some(generation(1));
        let result = Pair {
            earlier: GenerationContract {
                generation: generation(1),
                placement: Placement::Projector,
                reproducibility: &earlier,
            },
            later: GenerationContract {
                generation: generation(2),
                placement: Placement::Projector,
                reproducibility: &later,
            },
        }
        .agreed();

        result.expect("a lawfully differing prior stays outside the compared contract");
    }

    /// A scratch directory for one integrity fixture.
    fn scratch(name: &str) -> Utf8PathBuf {
        let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("the temp directory is UTF-8")
            .join(format!(
                "hash-graph-atlas-replay-{}-{name}",
                std::process::id(),
            ));
        let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("the scratch directory is creatable");
        dir
    }

    fn file_name(name: &str) -> FileName {
        FileName::new(name.to_owned()).expect("the fixture name is a plain file name")
    }

    fn bound_file(directory: &Utf8PathBuf, name: &str, bytes: &[u8]) -> RepositoryFile {
        fs::write(directory.join(name), bytes).expect("the fixture file is writable");
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        RepositoryFile {
            name: file_name(name),
            hash: hasher.finalize(),
        }
    }

    #[test]
    fn integrity_verified() {
        let directory = scratch("integrity-verified");
        let files = vec![
            bound_file(&directory, "alpha.arr", b"alpha bytes"),
            bound_file(&directory, "beta.arr", b"beta bytes"),
        ];

        VerifiedPair::verified_artifacts(generation(1), &directory, files)
            .expect("intact bytes match the recorded digests");
    }

    #[test]
    fn integrity_tampered() {
        let directory = scratch("integrity-tampered");
        let intact = bound_file(&directory, "alpha.arr", b"alpha bytes");
        let tampered = bound_file(&directory, "beta.arr", b"beta bytes");
        fs::write(directory.join("beta.arr"), b"other bytes").expect("the tamper is writable");

        let result =
            VerifiedPair::verified_artifacts(generation(1), &directory, [intact, tampered.clone()]);

        let mut hasher = Sha256::new();
        hasher.update(b"other bytes");
        let observed = hasher.finalize();
        assert!(matches!(
            result,
            Err(ReplayError::ArtifactIntegrity {
                generation: named,
                role,
                expected,
                observed: actual,
            }) if named == generation(1)
                && role == tampered.name
                && expected == tampered.hash
                && actual == observed,
        ));
    }

    #[test]
    fn integrity_unreadable() {
        let directory = scratch("integrity-unreadable");
        let missing = RepositoryFile {
            name: file_name("gone.arr"),
            hash: digest("gone"),
        };

        let result = VerifiedPair::verified_artifacts(generation(1), &directory, [missing]);

        assert!(matches!(
            result,
            Err(ReplayError::ReadArtifact { role, .. }) if role == file_name("gone.arr"),
        ));
    }
}
