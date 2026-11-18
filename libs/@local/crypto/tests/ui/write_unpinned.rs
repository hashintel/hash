use hash_crypto::Secret;

fn main() {
    let mut secret = Secret::<[u8; 4]>::zeroed();
    secret.expose_mut()[0] = 0xFF;
}
