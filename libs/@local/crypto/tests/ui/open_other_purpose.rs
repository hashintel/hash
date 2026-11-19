use core::pin::pin;

use hash_crypto::{
    Secret,
    aes_gcm::{AeadPurpose, Aes256GcmKey},
};

struct Tokens;

impl AeadPurpose for Tokens {
    type AssociatedData = ();

    fn associated_data((): &()) -> impl AsRef<[u8]> {
        []
    }
}

struct Sessions;

impl AeadPurpose for Sessions {
    type AssociatedData = ();

    fn associated_data((): &()) -> impl AsRef<[u8]> {
        []
    }
}

fn main() {
    let sessions = Aes256GcmKey::<Sessions>::from_secret(&Secret::zeroed());
    let tokens = Aes256GcmKey::<Tokens>::from_secret(&Secret::zeroed());

    let sealed = sessions
        .seal(&Secret::<[u8; 4]>::zeroed(), &())
        .expect("the plaintext should seal");
    let _ = tokens.open(&sealed, &(), pin!(Secret::<[u8; 4]>::zeroed()));
}
