use core::ptr;

use rand_core as rc10;
use rand_core_06 as rc06;

#[repr(transparent)]
pub(crate) struct Compat<R: ?Sized>(R);

impl<R: ?Sized> Compat<R> {
    pub(crate) const fn new(rng: R) -> Self
    where
        R: Sized,
    {
        Self(rng)
    }

    pub(crate) const fn from_ref(rng: &R) -> &Self {
        // SAFETY: repr(transparent)
        unsafe { &*(ptr::from_ref::<R>(rng) as *const Self) }
    }

    pub(crate) const fn from_mut(rng: &mut R) -> &mut Self {
        // SAFETY: repr(transparent)
        unsafe { &mut *(ptr::from_mut::<R>(rng) as *mut Self) }
    }
}

impl<R: rc10::SeedableRng> rc06::SeedableRng for Compat<R> {
    type Seed = R::Seed;

    fn from_seed(seed: Self::Seed) -> Self {
        Self(R::from_seed(seed))
    }

    fn seed_from_u64(state: u64) -> Self {
        Self(R::seed_from_u64(state))
    }
}

impl<R> rand_core_06::RngCore for Compat<R>
where
    R: rand_core::Rng + ?Sized,
{
    fn next_u32(&mut self) -> u32 {
        self.0.next_u32()
    }

    fn next_u64(&mut self) -> u64 {
        self.0.next_u64()
    }

    fn fill_bytes(&mut self, dest: &mut [u8]) {
        self.0.fill_bytes(dest);
    }

    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand_core_06::Error> {
        self.0.try_fill_bytes(dest).map_err(|_error| {
            rand_core_06::Error::from(const { core::num::NonZeroU32::new(1).unwrap() })
        })
    }
}
