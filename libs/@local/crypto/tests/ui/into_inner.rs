use core::pin::Pin;

use hash_crypto::Secret;

fn main() {
    let secret = Box::pin(Secret::<[u8; 4]>::zeroed());
    let _unpinned = Pin::into_inner(secret);
}
