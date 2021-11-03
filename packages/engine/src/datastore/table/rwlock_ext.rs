use crate::datastore::{Error, Result};
use parking_lot::{RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::ops::{Deref, DerefMut};

pub trait TryAcquire<K> {
    fn try_read_deref(&self) -> Result<&K>;
    fn try_write_deref(&mut self) -> Result<&mut K>;
    fn try_read_res<'a>(&self) -> Result<RwLockReadGuard<'a, K>>;
    fn try_write_res<'a>(&mut self) -> Result<RwLockWriteGuard<'a, K>>;
}

impl<K> TryAcquire<K> for RwLock<K> {
    fn try_read_deref(&self) -> Result<&K> {
        self.try_read()
            .map(|res| res.deref())
            .ok_or_else(|| Error::from("Failed to acquire read lock"))
    }

    fn try_write_deref(&mut self) -> Result<&mut K> {
        self.try_write()
            .map(|mut res| res.deref_mut())
            .ok_or_else(|| Error::from("Failed to acquire write lock"))
    }

    fn try_read_res(&self) -> Result<RwLockReadGuard<'_, K>> {
        self.try_read()
            .ok_or_else(|| Error::from("Failed to acquire read lock"))
    }

    fn try_write_res(&mut self) -> Result<RwLockWriteGuard<'_, K>> {
        self.try_write()
            .ok_or_else(|| Error::from("Failed to acquire write lock"))
    }
}
