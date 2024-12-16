import type { Uint8ArrayList } from "uint8arraylist";

export type { Config as YamuxConfig } from "@chainsafe/libp2p-yamux/config";
export type { TCPOptions as TCPConfig, TCPSocketOptions } from "@libp2p/tcp";

// Vendored from @chainsafe/libp2p-noise
export interface NoiseExtensions {
  webtransportCerthashes: Uint8Array[];
}

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface ICryptoInterface {
  hashSHA256: (data: Uint8Array | Uint8ArrayList) => Uint8Array;

  getHKDF: (
    ck: Uint8Array,
    ikm: Uint8Array,
  ) => [Uint8Array, Uint8Array, Uint8Array];

  generateX25519KeyPair: () => KeyPair;
  generateX25519KeyPairFromSeed: (seed: Uint8Array) => KeyPair;
  generateX25519SharedKey: (
    privateKey: Uint8Array | Uint8ArrayList,
    publicKey: Uint8Array | Uint8ArrayList,
  ) => Uint8Array;

  chaCha20Poly1305Encrypt: (
    plaintext: Uint8Array | Uint8ArrayList,
    nonce: Uint8Array,
    ad: Uint8Array,
    k: Uint8Array,
  ) => Uint8ArrayList | Uint8Array;
  chaCha20Poly1305Decrypt: (
    ciphertext: Uint8Array | Uint8ArrayList,
    nonce: Uint8Array,
    ad: Uint8Array,
    k: Uint8Array,
    dst?: Uint8Array,
  ) => Uint8ArrayList | Uint8Array;
}

export interface NoiseConfig {
  staticNoiseKey?: Uint8Array;
  extensions?: NoiseExtensions;
  crypto?: ICryptoInterface;
  prologueBytes?: Uint8Array;
}
