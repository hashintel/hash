const PERSONA_VERBOSITY_VALUES = ["terse", "default", "expansive"] as const;
const PERSONA_DISCLOSURE_VALUES = [
  "reticent",
  "default",
  "forthcoming",
] as const;

type PersonaVerbosity = (typeof PERSONA_VERBOSITY_VALUES)[number];
type PersonaDisclosure = (typeof PERSONA_DISCLOSURE_VALUES)[number];

export type PersonaAxisSettings = {
  personaVerbosity: PersonaVerbosity;
  personaDisclosure: PersonaDisclosure;
};

const PERSONA_DEFAULT_VERBOSITY: PersonaVerbosity = "default";
const PERSONA_DEFAULT_DISCLOSURE: PersonaDisclosure = "default";

const isPersonaVerbosity = (value: string): value is PersonaVerbosity =>
  PERSONA_VERBOSITY_VALUES.some((candidate) => candidate === value);

const isPersonaDisclosure = (value: string): value is PersonaDisclosure =>
  PERSONA_DISCLOSURE_VALUES.some((candidate) => candidate === value);

export const resolvePersonaAxisSettings = (
  input: {
    personaVerbosity?: string;
    personaDisclosure?: string;
  } = {},
): PersonaAxisSettings => {
  const personaVerbosity = input.personaVerbosity ?? PERSONA_DEFAULT_VERBOSITY;
  if (!isPersonaVerbosity(personaVerbosity))
    throw new Error(
      `Unsupported persona verbosity ${personaVerbosity}; expected ${PERSONA_VERBOSITY_VALUES.join("|")}`,
    );

  const personaDisclosure =
    input.personaDisclosure ?? PERSONA_DEFAULT_DISCLOSURE;
  if (!isPersonaDisclosure(personaDisclosure))
    throw new Error(
      `Unsupported persona disclosure ${personaDisclosure}; expected ${PERSONA_DISCLOSURE_VALUES.join("|")}`,
    );

  return { personaVerbosity, personaDisclosure };
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const axisSettingsFromRun = (config: unknown): PersonaAxisSettings => {
  if (!record(config)) throw new Error("Persona run is missing axis settings");
  return resolvePersonaAxisSettings({
    personaVerbosity:
      typeof config.personaVerbosity === "string"
        ? config.personaVerbosity
        : undefined,
    personaDisclosure:
      typeof config.personaDisclosure === "string"
        ? config.personaDisclosure
        : undefined,
  });
};
