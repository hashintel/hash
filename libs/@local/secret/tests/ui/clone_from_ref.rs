#![feature(clone_from_ref)]

use hash_secret::Secret;

fn main() {
    let secret = Box::pin(Secret::<[u8; 4]>::zeroed());
    let _unpinned: Box<Secret<[u8; 4]>> = Box::clone_from_ref(&*secret);
}
