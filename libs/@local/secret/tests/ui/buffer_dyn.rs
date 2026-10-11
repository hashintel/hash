#![feature(clone_to_uninit)]

use core::{clone::CloneToUninit, pin::Pin};

use hash_secret::{Secret, SecretBuffer};

trait Leak: CloneToUninit + AsRef<[u8]> + AsMut<[u8]> {}

impl<const N: usize> Leak for [u8; N] {}

impl SecretBuffer for dyn Leak {
    type View = [u8];

    fn as_view(&self) -> &[u8] {
        self.as_ref()
    }

    fn as_view_mut(&mut self) -> &mut [u8] {
        self.as_mut()
    }

    fn zeroize(_contents: &mut Self) {}
}

fn main() {
    let _erased: Pin<Box<Secret<dyn Leak>>> = Box::pin(Secret::<[u8; 4]>::zeroed());
}
