#![feature(clone_to_uninit)]

use core::{clone::CloneToUninit, pin::Pin};

use hash_crypto::{Secret, SecretBuffer};

trait Leak: CloneToUninit + AsRef<[u8]> + AsMut<[u8]> {}

impl<const N: usize> Leak for [u8; N] {}

impl SecretBuffer for dyn Leak {
    type View = [u8];
}

impl zeroize::Zeroize for dyn Leak {
    fn zeroize(&mut self) {}
}

fn main() {
    let _erased: Pin<Box<Secret<dyn Leak>>> = Box::pin(Secret::<[u8; 4]>::zeroed());
}
