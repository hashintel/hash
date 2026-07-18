use core::{fmt::Display, num::TryFromIntError};
use std::{
    fs::{File, TryLockError},
    io,
};

use camino::Utf8Path;
use hannoy::{Database, Reader, Writer, distances::Cosine};
use heed::{Env, EnvOpenOptions};
use rand::{SeedableRng, prelude::Rng};

use super::{Embedding, NearestNeighboursIndex, Neighbour};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::AlignedVecN,
    random::Compat,
};

#[derive(Debug)]
enum HannoyIndexError {
    Hannoy(hannoy::Error),
    Heed(heed::Error),
    Io(io::Error),
    TryLock(TryLockError),
    IndexTooLarge(TryFromIntError),
}

impl Display for HannoyIndexError {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Hannoy(err) => write!(fmt, "Hannoy error: {}", err),
            Self::Heed(err) => write!(fmt, "Heed error: {}", err),
            Self::Io(err) => write!(fmt, "IO error: {}", err),
            Self::TryLock(err) => write!(fmt, "unable to acquire lock: {}", err),
            Self::IndexTooLarge(err) => write!(fmt, "index too large: {}", err),
        }
    }
}

impl core::error::Error for HannoyIndexError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Hannoy(err) => Some(err),
            Self::Heed(err) => Some(err),
            Self::Io(err) => Some(err),
            Self::TryLock(err) => Some(err),
            Self::IndexTooLarge(err) => Some(err),
        }
    }
}

impl From<hannoy::Error> for HannoyIndexError {
    fn from(err: hannoy::Error) -> Self {
        Self::Hannoy(err)
    }
}

impl From<heed::Error> for HannoyIndexError {
    fn from(err: heed::Error) -> Self {
        Self::Heed(err)
    }
}

impl From<io::Error> for HannoyIndexError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

impl From<TryLockError> for HannoyIndexError {
    fn from(err: TryLockError) -> Self {
        Self::TryLock(err)
    }
}

const M: usize = 16;
const M0: usize = 32;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct HannoyIndexOptions {
    map_size: usize = 1024 * 1024 * 1024, // 1GiB - TODO: what happens if the database is... too large?
    ef_construction: usize = 128,
    ef_search: usize = 128, // TODO: tweak
}

struct HannoyIndex {
    env: Env,
    db: Database<Cosine>,
    writer: Writer<Cosine>,
    options: HannoyIndexOptions,
    _lock: File,
}

impl HannoyIndex {
    fn new(
        base: impl AsRef<Utf8Path>,
        options: HannoyIndexOptions,
    ) -> Result<Self, HannoyIndexError> {
        let base = base.as_ref();
        let lockfile = base.with_extension("lock");

        let lock = File::create(&lockfile)?;
        lock.try_lock()?;

        // SAFETY: While we cannot guarantee that we're the only one that accesses it, any opening
        // of the database through our controlled access surface goes through a mandatory file lock.
        let env = unsafe {
            EnvOpenOptions::new()
                .map_size(options.map_size)
                .open(base)?
        };

        let mut wtxn = env.write_txn()?;
        let db = env.create_database(&mut wtxn, None)?;
        let writer = Writer::new(db, 0, PROJECTOR_DIMENSIONS);
        drop(wtxn);

        Ok(Self {
            env,
            db,
            writer,
            options,
            _lock: lock,
        })
    }
}

impl NearestNeighboursIndex for HannoyIndex {
    type Error = HannoyIndexError;

    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding>>,
    ) -> Result<(), Self::Error> {
        let mut wtxn = self.env.write_txn()?;

        for embedding in embeddings {
            self.writer.add_item(
                &mut wtxn,
                u32::try_from(embedding.id.get()).map_err(HannoyIndexError::IndexTooLarge)?,
                embedding.embedding.as_array(),
            )?;
        }

        wtxn.commit()?;
        Ok(())
    }

    fn build(&mut self, rng: impl Rng + SeedableRng) -> Result<(), Self::Error> {
        let mut wtxn = self.env.write_txn()?;

        let mut rng = Compat::new(rng);
        let mut builder = self.writer.builder(&mut rng);
        builder
            .ef_construction(self.options.ef_construction)
            .build::<M, M0>(&mut wtxn)?;

        wtxn.commit()?;
        Ok(())
    }

    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let rtxn = self.env.read_txn()?;
        let reader = Reader::open(&rtxn, 0, self.db)?;

        let mut results = reader
            .nns(limit)
            .ef_search(self.options.ef_search)
            .by_vector(&rtxn, query.as_array())?
            .into_nns();

        results.sort_by(|&(_, lhs), (_, rhs)| lhs.total_cmp(rhs));
        Ok(results.into_iter().map(|(id, distance)| Neighbour {
            id: NodeRowId::new(u64::from(id)),
            distance,
        }))
    }

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let rtxn = self.env.read_txn()?;
        let reader = Reader::open(&rtxn, 0, self.db)?;

        let Some(results) = reader
            .nns(limit + 1)
            .ef_search(self.options.ef_search)
            .by_item(
                &rtxn,
                u32::try_from(id.get()).map_err(HannoyIndexError::IndexTooLarge)?,
            )?
        else {
            return Err(HannoyIndexError::Io(io::Error::new(
                io::ErrorKind::NotFound,
                "item not found",
            )));
        };

        let mut results = results.into_nns();
        results.sort_by(|&(_, lhs), (_, rhs)| lhs.total_cmp(rhs));
        results.retain(|&(matched, _)| u64::from(matched) != id.get());

        Ok(results.into_iter().map(|(id, distance)| Neighbour {
            id: NodeRowId::new(u64::from(id)),
            distance,
        }))
    }
}
