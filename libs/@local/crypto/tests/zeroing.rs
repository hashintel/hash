//! Checks that the memory of secrets is all zeros when it is freed.
//!
//! Miri checks the layout passed to `dealloc` only while no custom global allocator is installed,
//! so these tests stay out of the library's test binary.

use core::{
    alloc::{GlobalAlloc, Layout},
    cell::Cell,
    ops::Deref,
    pin::{Pin, pin},
    ptr, slice,
    sync::atomic::{AtomicBool, AtomicPtr, AtomicUsize, Ordering},
};
use std::{
    alloc::System,
    sync::{Mutex, MutexGuard, PoisonError},
};

use hash_crypto::{
    Secret, SecretBuffer,
    aes_gcm::{AeadPurpose, Aes256GcmKey},
};
use rstest::rstest;

/// Fills watched ranges, so that a range nobody zeroed does not pass as zeroed.
const POISON: u8 = 0xA5;

static WATCHED: AtomicPtr<u8> = AtomicPtr::new(ptr::null_mut());
static WATCHED_LEN: AtomicUsize = AtomicUsize::new(0);
static FREED_ZEROED: AtomicBool = AtomicBool::new(false);

/// Serializes the tests, since only one range is watched at a time.
static WATCHING: Mutex<()> = Mutex::new(());

thread_local! {
    /// The number of allocations made by the current thread.
    static ALLOCATIONS: Cell<usize> = const { Cell::new(0) };
}

struct WatchingAllocator;

#[expect(
    unsafe_code,
    reason = "forwards to the system allocator and reads a block before freeing it"
)]
// SAFETY: `alloc` and `dealloc` forward to `System` with the same arguments. `alloc` first counts
//         the allocation and `dealloc` may first read the block; neither allocates nor unwinds.
unsafe impl GlobalAlloc for WatchingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCATIONS.with(|count| count.set(count.get().wrapping_add(1)));
        // SAFETY: The caller upholds `GlobalAlloc::alloc`'s contract.
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        let start = WATCHED.load(Ordering::SeqCst);
        let len = WATCHED_LEN.load(Ordering::SeqCst);
        if let Some(offset) = start.addr().checked_sub(ptr.addr())
            && offset
                .checked_add(len)
                .is_some_and(|end| end <= layout.size())
            && WATCHED
                .compare_exchange(start, ptr::null_mut(), Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
        {
            // SAFETY: `ptr` is still allocated with `layout`, the watched range lies within the
            //         block, and every watched range is fully written before `watch` is called.
            let bytes = unsafe { slice::from_raw_parts(ptr.add(offset), len) };
            FREED_ZEROED.store(bytes.iter().all(|&byte| byte == 0), Ordering::SeqCst);
        }
        // SAFETY: The caller upholds `GlobalAlloc::dealloc`'s contract.
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: WatchingAllocator = WatchingAllocator;

/// Watches `len` bytes from `start` until the block that contains them is freed.
///
/// Hold the returned guard until [`freed_zeroed`] has been checked.
fn watch(start: *const u8, len: usize) -> MutexGuard<'static, ()> {
    let guard = WATCHING.lock().unwrap_or_else(PoisonError::into_inner);
    FREED_ZEROED.store(false, Ordering::SeqCst);
    WATCHED_LEN.store(len, Ordering::SeqCst);
    WATCHED.store(start.cast_mut(), Ordering::SeqCst);
    guard
}

fn freed_zeroed() -> bool {
    FREED_ZEROED.load(Ordering::SeqCst)
}

fn poisoned_array() -> Pin<Box<Secret<[u8; 32]>>> {
    let mut secret = Box::pin(Secret::zeroed());
    secret.as_mut().expose_mut().fill(POISON);
    secret
}

fn poisoned_slice() -> Pin<Box<Secret<[u8]>>> {
    let mut secret = Secret::zeroed_slice(32);
    secret.as_mut().expose_mut().fill(POISON);
    secret
}

#[rstest]
#[case::array(poisoned_array())]
#[case::slice(poisoned_slice())]
#[case::unsized_array(poisoned_array() as Pin<Box<Secret<[u8]>>>)]
#[case::text(Secret::from_string("hunter2".to_owned()))]
#[case::clone(Pin::clone(&poisoned_array()))]
#[case::to_boxed(poisoned_slice().to_boxed())]
#[case::to_arc(poisoned_slice().to_arc())]
#[case::to_rc(poisoned_array().to_rc())]
fn drop_zeroes<P, T>(#[case] secret: Pin<P>)
where
    P: Deref<Target = Secret<T>>,
    T: ?Sized + SecretBuffer,
{
    let bytes = secret.expose().as_ref();
    let _guard = watch(bytes.as_ptr(), bytes.len());
    drop(secret);

    assert!(
        freed_zeroed(),
        "the secret should be zeroed before it is freed"
    );
}

#[test]
fn from_string_source_zeroed() {
    let mut bytes = vec![POISON; 32];
    // The whole capacity holds poison, and `clear` leaves it in place, so it is only gone if it is
    // zeroed.
    bytes.resize(bytes.capacity(), POISON);
    bytes.clear();
    bytes.extend_from_slice(b"hunter2");
    let value = String::from_utf8(bytes).expect("the text should be UTF-8");
    let _guard = watch(value.as_ptr(), value.capacity());

    let secret = Secret::from_string(value);

    assert!(
        freed_zeroed(),
        "the source should be zeroed, spare capacity included, before it is freed"
    );
    drop(secret);
}

#[rstest]
#[case::slice(|hex| drop(Secret::<[u8]>::from_hex(hex)), "deadbeef")]
#[case::slice_odd_length(|hex| drop(Secret::<[u8]>::from_hex(hex)), "deadbee")]
#[case::array(|hex| drop(Secret::<[u8; 4]>::from_hex(hex)), "deadbeef")]
fn from_hex_source_zeroed(#[case] from_hex: fn(String), #[case] hex: &str) {
    let mut bytes = vec![POISON; 32];
    // The whole capacity holds poison, and `clear` leaves it in place, so it is only gone if it is
    // zeroed.
    bytes.resize(bytes.capacity(), POISON);
    bytes.clear();
    bytes.extend_from_slice(hex.as_bytes());
    let value = String::from_utf8(bytes).expect("the hex should be UTF-8");
    let _guard = watch(value.as_ptr(), value.capacity());

    from_hex(value);

    assert!(
        freed_zeroed(),
        "the source should be zeroed, spare capacity included, before it is freed"
    );
}

#[test]
fn from_vec_source_zeroed() {
    let mut value = vec![POISON; 32];
    // The whole capacity holds poison, and `truncate` leaves it in place, so it is only gone if it
    // is zeroed.
    value.resize(value.capacity(), POISON);
    value.truncate(7);
    let _guard = watch(value.as_ptr(), value.capacity());

    let secret = Secret::from_vec(value);

    assert!(
        freed_zeroed(),
        "the source should be zeroed, spare capacity included, before it is freed"
    );
    drop(secret);
}

#[test]
fn decode_hex_allocation_free() {
    let mut secret = pin!(Secret::<[u8; 16]>::zeroed());
    let mut hex = String::from("0123456789abcdeffedcba9876543210");

    let before = ALLOCATIONS.with(Cell::get);
    let result = secret.as_mut().decode_hex(&mut hex);
    let after = ALLOCATIONS.with(Cell::get);

    result.expect("the hex should decode");
    assert_eq!(
        after, before,
        "decoding should not copy the secret into another allocation"
    );
}

struct Test;

impl AeadPurpose for Test {
    type AssociatedData = [u8];

    fn associated_data(data: &[u8]) -> impl AsRef<[u8]> {
        data
    }
}

#[test]
#[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
fn open_allocation_free() {
    let key = Aes256GcmKey::<Test>::from_secret(&Secret::zeroed());
    let sealed = key
        .seal(&Secret::<[u8; 32]>::zeroed(), b"row")
        .expect("the plaintext should seal");
    let mut plaintext = pin!(Secret::<[u8; 32]>::zeroed());

    let before = ALLOCATIONS.with(Cell::get);
    let result = key.open(&sealed, b"row", plaintext.as_mut());
    let after = ALLOCATIONS.with(Cell::get);

    result.expect("the sealed value should open");
    assert_eq!(
        after, before,
        "opening should not copy the plaintext into another allocation"
    );
}
