/**
 * Host-provided optimization capability for Petrinaut.
 *
 * The initial contract intentionally has no inputs: experiment properties and
 * optimization configuration will be added as that integration is defined.
 */
export type PetrinautOptimization = {
  optimize(): AsyncIterable<number>;
};
