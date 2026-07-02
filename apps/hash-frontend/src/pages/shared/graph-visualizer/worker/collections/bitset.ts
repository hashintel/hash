/* eslint-disable no-bitwise */
/* eslint-disable no-param-reassign */
/* eslint-disable operator-assignment */
/**
 * Fixed-universe bit set over a Uint32Array word store.
 *
 * Operations (or, and, intersectionCount, jaccard) are all O(words)
 * where words = ceil(universe / 32).
 */

// eslint-disable-next-line id-length
function popcount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  n = (n + (n >>> 4)) & 0x0f0f0f0f;
  return (n * 0x01010101) >>> 24;
}

export class BitSet<T extends number> {
  #words: Uint32Array<ArrayBuffer>;
  #cardinality: number;

  private constructor(words: Uint32Array<ArrayBuffer>, cardinality: number) {
    this.#words = words;
    this.#cardinality = cardinality;
  }

  static empty<T extends number>(universeSize: number): BitSet<T> {
    const wordCount = Math.ceil(universeSize / 32) || 1;

    return new BitSet(new Uint32Array(wordCount), 0);
  }

  static fromBit<T extends number>(universeSize: number, bit: T): BitSet<T> {
    const set = BitSet.empty<T>(universeSize);
    set.add(bit);

    return set;
  }

  get words(): Uint32Array {
    return this.#words;
  }

  get cardinality(): number {
    return this.#cardinality;
  }

  has(bit: T): boolean {
    const word = bit >>> 5;
    const mask = 1 << (bit & 31);
    return word < this.#words.length && (this.#words[word]! & mask) !== 0;
  }

  #grow(): void {
    if (this.#words.buffer.resizable) {
      this.#words.buffer.resize(this.#words.buffer.byteLength * 2);
      this.#words = new Uint32Array(this.#words.buffer);
    } else {
      const newWords = new Uint32Array(this.#words.buffer.byteLength * 2);
      newWords.set(this.#words);
      this.#words = newWords;
    }
  }

  add(bit: T): void {
    const word = bit >>> 5;
    const mask = 1 << (bit & 31);
    while (word >= this.#words.length) {
      this.#grow();
    }

    if ((this.#words[word]! & mask) === 0) {
      this.#words[word]! |= mask;
      this.#cardinality++;
    }
  }

  /** Remove every member; keeps the allocated word capacity for reuse. */
  clear(): void {
    this.#words.fill(0);
    this.#cardinality = 0;
  }

  /** Returns a new BitSet that is the union of this and other. */
  or(other: BitSet<T>): BitSet<T> {
    const len = Math.max(this.#words.length, other.#words.length);
    const result = new Uint32Array(len);
    let cardinality = 0;

    for (let index = 0; index < len; index++) {
      const word = (this.#words[index] ?? 0) | (other.#words[index] ?? 0);
      result[index] = word;
      cardinality += popcount(word);
    }

    return new BitSet(result, cardinality);
  }

  /** Returns a new BitSet that is the intersection of this and other. */
  and(other: BitSet<T>): BitSet<T> {
    const len = Math.min(this.#words.length, other.#words.length);
    const result = new Uint32Array(len);
    let cardinality = 0;

    for (let index = 0; index < len; index++) {
      const word = this.#words[index]! & other.#words[index]!;
      result[index] = word;
      cardinality += popcount(word);
    }

    return new BitSet(result, cardinality);
  }

  /** Count of bits set in both this and other, without allocating. */
  intersectionCount(other: BitSet<T>): number {
    const len = Math.min(this.#words.length, other.#words.length);
    let count = 0;

    for (let index = 0; index < len; index++) {
      count += popcount(this.#words[index]! & other.#words[index]!);
    }

    return count;
  }

  /** Jaccard similarity: |A ∩ B| / |A ∪ B|. Returns 1 if both empty. */
  jaccard(other: BitSet<T>): number {
    const intersection = this.intersectionCount(other);
    const union = this.#cardinality + other.#cardinality - intersection;
    return union === 0 ? 1 : intersection / union;
  }

  /** Iterate over set bit positions. */
  *members(): IterableIterator<T> {
    for (let word = 0; word < this.#words.length; word++) {
      let bits = this.#words[word]!;
      while (bits !== 0) {
        const lsb = bits & -bits;
        yield ((word << 5) + Math.log2(lsb)) as T;
        bits ^= lsb;
      }
    }
  }

  clone(): BitSet<T> {
    return new BitSet(new Uint32Array(this.#words), this.#cardinality);
  }
}
