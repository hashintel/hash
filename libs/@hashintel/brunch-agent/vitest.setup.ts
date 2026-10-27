import { installMatchMediaIfMissing } from "./src/ui/testing/match-media.ts";

/**
 * Petrinaut's UI entry probes `matchMedia` while its modules load, which jsdom
 * does not implement; every test that renders Petrinaut AI's chat loads it.
 */
installMatchMediaIfMissing();
