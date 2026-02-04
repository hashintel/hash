import type { Entity, LinkEntity } from "@blockprotocol/type-system";
import type {
  Aircraft,
  Airline,
  Airport,
  ArrivesAt,
  DepartsFrom,
  Flight,
} from "@local/hash-isomorphic-utils/system-types/flight";

const vertices = {
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~aa22a374-a475-438e-8e72-f53d0c54b71d": {
    "2026-01-30T13:44:09.180571000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/iata-code/": "LM",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "LOG",
          "https://hash.ai/@h/types/property-type/icao-code/": "LOG",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~aa22a374-a475-438e-8e72-f53d0c54b71d",
            editionId: "2d46c6eb-fef0-4cab-a892-9d881238c2ff",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:09.180571000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:09.180571000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airline/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:11:16.955093000Z",
            createdAtDecisionTime: "2026-01-30T13:11:16.955093000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:11:16.955093000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:11:16.955093000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:44:06.036000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "LOG",
                    },
                  },
                },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "LM",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "LOG",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~42c57e8b-8912-430c-b8d1-8aee077ae28f": {
    "2026-01-30T13:44:09.867604000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/flight-number/": "8Y210",
          "https://hash.ai/@h/types/property-type/flight-status/": "Scheduled",
          "https://hash.ai/@h/types/property-type/icao-code/": "AAV210",
          "https://hash.ai/@h/types/property-type/flight-type/": "Airline",
          "https://hash.ai/@h/types/property-type/flight-date/": "2026-01-30",
          "https://hash.ai/@h/types/property-type/iata-code/": "8Y210",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~42c57e8b-8912-430c-b8d1-8aee077ae28f",
            editionId: "edc1b3db-a52b-40ce-9c9a-380a387ab132",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:09.867604000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:09.867604000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/flight/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:49.546217000Z",
            createdAtDecisionTime: "2026-01-30T13:12:49.546217000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:49.546217000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:49.546217000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/flight-number/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "8Y210",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-status/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/flight-status/":
                      "Scheduled",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-type/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Airline",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "8Y210",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "AAV210",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-date/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/date/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/date/": "2026-01-30",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~be6f15d4-3439-4318-beda-443f6001cd03": {
    "2026-01-30T13:44:08.945683000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/city/":
            "St Mawgan (Cornwall)",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "Newquay Cornwall",
          "https://hash.ai/@h/types/property-type/timezone/": "Europe/London",
          "https://hash.ai/@h/types/property-type/iata-code/": "NQY",
          "https://hash.ai/@h/types/property-type/icao-code/": "EGHQ",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~be6f15d4-3439-4318-beda-443f6001cd03",
            editionId: "d1a7348a-f6f8-4dd4-80bb-e35f8b960a93",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:08.945683000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:08.945683000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:49.699699000Z",
            createdAtDecisionTime: "2026-01-30T13:12:49.699699000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:49.699699000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:49.699699000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/city/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "St Mawgan (Cornwall)",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/timezone/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Europe/London",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "NQY",
                  },
                },
              },
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:44:06.036000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "Newquay Cornwall",
                    },
                  },
                },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "EGHQ",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~5f305e8d-28ef-476c-b438-7e5edca178c2": {
    "2026-01-30T13:11:16.830410000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/icao-code/": "EGLL",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "London Heathrow",
          "https://hash.ai/@h/types/property-type/city/": "London",
          "https://hash.ai/@h/types/property-type/timezone/": "Europe/London",
          "https://hash.ai/@h/types/property-type/iata-code/": "LHR",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~5f305e8d-28ef-476c-b438-7e5edca178c2",
            editionId: "e7bddc9b-af88-4482-89b7-8113e935e12b",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:16.830410000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:16.830410000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:11:16.830410000Z",
            createdAtDecisionTime: "2026-01-30T13:11:16.830410000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:11:16.830410000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:11:16.830410000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:11:16.491000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~a5731087-661d-44c8-8647-e849b3cf59ce",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/city/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "London",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/timezone/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Europe/London",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "LHR",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "EGLL",
                  },
                },
              },
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:11:16.491000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "London Heathrow",
                    },
                  },
                },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~bd19cd95-ac63-4948-b03a-108c02ed6da3": {
    "2026-01-30T13:44:10.011246000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/iata-code/": "ISC",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "St. Mary's",
          "https://hash.ai/@h/types/property-type/city/": "St. Mary's",
          "https://hash.ai/@h/types/property-type/timezone/": "Europe/London",
          "https://hash.ai/@h/types/property-type/icao-code/": "EGHE",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~bd19cd95-ac63-4948-b03a-108c02ed6da3",
            editionId: "7a8ac259-af04-4748-9679-db5916540e0f",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.011246000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.011246000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:49.631238000Z",
            createdAtDecisionTime: "2026-01-30T13:12:49.631238000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:49.631238000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:49.631238000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:44:06.036000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "St. Mary's",
                    },
                  },
                },
              "https://hash.ai/@h/types/property-type/timezone/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Europe/London",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "ISC",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "EGHE",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/city/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "St. Mary's",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~351ef377-1b7e-45bd-b6b5-b773c8f0d55a": {
    "2026-01-30T13:44:10.532025000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/iata-code/": "RK9228",
          "https://hash.ai/@h/types/property-type/icao-code/": "RUK9228",
          "https://hash.ai/@h/types/property-type/flight-type/": "Airline",
          "https://hash.ai/@h/types/property-type/flight-date/": "2026-01-30",
          "https://hash.ai/@h/types/property-type/flight-status/": "Scheduled",
          "https://hash.ai/@h/types/property-type/flight-number/": "RK9228",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~351ef377-1b7e-45bd-b6b5-b773c8f0d55a",
            editionId: "050577bc-8ae1-443c-83f5-3d5fb5cb6c4a",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.532025000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.532025000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/flight/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.266694000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.266694000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.266694000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.266694000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "RUK9228",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-number/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "RK9228",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "RK9228",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-date/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/date/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/date/": "2026-01-30",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-type/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Airline",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-status/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/flight-status/":
                      "Scheduled",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~f335ab94-dc8b-4a5a-aba3-8bea5eea1664": {
    "2026-01-30T13:11:17.356409000Z": {
      kind: "entity",
      inner: {
        properties: {},
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~d915d524-ece1-4981-83e8-bedeee7f0019",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~aa22a374-a475-438e-8e72-f53d0c54b71d",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~f335ab94-dc8b-4a5a-aba3-8bea5eea1664",
            editionId: "28cc09d5-7e1c-49ae-b17b-9c0b7166c308",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:17.356409000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:17.356409000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/operated-by/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:11:17.356409000Z",
            createdAtDecisionTime: "2026-01-30T13:11:17.356409000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:11:17.356409000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:11:17.356409000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:11:16.491000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~a5731087-661d-44c8-8647-e849b3cf59ce",
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~39239012-24ff-404b-9d24-9aabc4fccfb3": {
    "2026-01-30T13:44:11.140387000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": 0,
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T10:35:00Z",
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T10:40:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T10:40:00Z",
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T10:35:00Z",
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~42c57e8b-8912-430c-b8d1-8aee077ae28f",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~be6f15d4-3439-4318-beda-443f6001cd03",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~39239012-24ff-404b-9d24-9aabc4fccfb3",
            editionId: "8a09bf5f-d9c2-475a-bff6-e288b4005782",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.140387000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.140387000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/arrives-at/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.653736000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.653736000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.653736000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.653736000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T10:40:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T10:35:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": 0,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T10:40:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T10:35:00Z",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~3ba53838-4177-4a1d-9384-f75105abb878": {
    "2026-01-30T13:44:10.893444000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T13:47:22Z",
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T13:10:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T13:20:00Z",
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T13:57:22Z",
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": 2242,
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~46ad3ba6-6629-49c3-8a20-6362e704d896",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~be6f15d4-3439-4318-beda-443f6001cd03",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~3ba53838-4177-4a1d-9384-f75105abb878",
            editionId: "9a655962-2c6c-45a7-98c3-83b49c04898c",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.893444000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.893444000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/arrives-at/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:51.013542000Z",
            createdAtDecisionTime: "2026-01-30T13:12:51.013542000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:51.013542000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:51.013542000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T13:57:22Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T13:20:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T13:10:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": 2242,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T13:47:22Z",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~e01cadf2-cf34-462b-a489-9d57f4bd171d": {
    "2026-01-30T13:44:08.680517000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/iata-code/": "MAN",
          "https://hash.ai/@h/types/property-type/icao-code/": "EGCC",
          "https://hash.ai/@h/types/property-type/city/": "Manchester",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "Manchester",
          "https://hash.ai/@h/types/property-type/timezone/": "Europe/London",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~e01cadf2-cf34-462b-a489-9d57f4bd171d",
            editionId: "fb4e31b3-f363-4081-b9b3-2379101a8b5f",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:08.680517000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:08.680517000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:49.910735000Z",
            createdAtDecisionTime: "2026-01-30T13:12:49.910735000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:49.910735000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:49.910735000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "EGCC",
                  },
                },
              },
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:44:06.036000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "Manchester",
                    },
                  },
                },
              "https://hash.ai/@h/types/property-type/timezone/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Europe/London",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/city/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Manchester",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "MAN",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~d915d524-ece1-4981-83e8-bedeee7f0019": {
    "2026-01-30T13:11:16.733691000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/flight-type/": "Airline",
          "https://hash.ai/@h/types/property-type/iata-code/": "LM626",
          "https://hash.ai/@h/types/property-type/flight-number/": "LM626",
          "https://hash.ai/@h/types/property-type/codeshare/": [
            {
              "https://hash.ai/@h/types/property-type/icao-code/": "BAW7856",
              "https://hash.ai/@h/types/property-type/iata-code/": "BA7856",
            },
          ],
          "https://hash.ai/@h/types/property-type/icao-code/": "LOG626",
          "https://hash.ai/@h/types/property-type/flight-date/": "2026-01-30",
          "https://hash.ai/@h/types/property-type/flight-status/": "Scheduled",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~d915d524-ece1-4981-83e8-bedeee7f0019",
            editionId: "a9513392-0a6d-45f9-96d9-fb630149e257",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:16.733691000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:16.733691000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/flight/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:11:16.733691000Z",
            createdAtDecisionTime: "2026-01-30T13:11:16.733691000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:11:16.733691000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:11:16.733691000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:11:16.491000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~a5731087-661d-44c8-8647-e849b3cf59ce",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/flight-number/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "LM626",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-type/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Airline",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/codeshare/": {
                value: [
                  {
                    value: {
                      "https://hash.ai/@h/types/property-type/icao-code/": {
                        metadata: {
                          provenance: {
                            sources: [
                              {
                                type: "integration",
                                location: {
                                  name: "FlightAware AeroAPI",
                                  uri: "https://aeroapi.flightaware.com/aeroapi/",
                                },
                                loadedAt: "2026-01-30T13:11:16.491000000Z",
                              },
                            ],
                          },
                          dataTypeId:
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                          originalDataTypeId:
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                          canonical: {
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                              "BAW7856",
                          },
                        },
                      },
                      "https://hash.ai/@h/types/property-type/iata-code/": {
                        metadata: {
                          provenance: {
                            sources: [
                              {
                                type: "integration",
                                location: {
                                  name: "FlightAware AeroAPI",
                                  uri: "https://aeroapi.flightaware.com/aeroapi/",
                                },
                                loadedAt: "2026-01-30T13:11:16.491000000Z",
                              },
                            ],
                          },
                          dataTypeId:
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                          originalDataTypeId:
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                          canonical: {
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                              "BA7856",
                          },
                        },
                      },
                    },
                  },
                ],
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "LOG626",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-status/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/flight-status/":
                      "Scheduled",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-date/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/date/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/date/": "2026-01-30",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "LM626",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~a27a71d7-5f69-47af-a94d-5307daaf5af8": {
    "2026-01-30T13:44:11.278523000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T13:30:00Z",
          "https://hash.ai/@h/types/property-type/gate/": "111",
          "https://hash.ai/@h/types/property-type/terminal/": "1",
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": -60,
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T13:39:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T13:40:00Z",
          "https://hash.ai/@h/types/property-type/actual-gate-time/":
            "2026-01-30T13:29:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T13:30:00Z",
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~189c9c30-d44b-4eb4-8dd6-fe866a904b4b",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~f52f3e22-10ab-4066-8e67-6a865a176872",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~a27a71d7-5f69-47af-a94d-5307daaf5af8",
            editionId: "192afea3-6ef0-4f1f-8708-68edcffc2f88",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.278523000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.278523000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/departs-from/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:51.187241000Z",
            createdAtDecisionTime: "2026-01-30T13:12:51.187241000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:51.187241000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:51.187241000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/actual-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T13:29:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T13:30:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T13:39:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T13:30:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T13:40:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/gate/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "111",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": -60,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/terminal/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "1",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~facfd972-ce08-4a01-a96f-e2e22b528bdd": {
    "2026-01-30T13:12:51.115391000Z": {
      kind: "entity",
      inner: {
        properties: {},
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~46ad3ba6-6629-49c3-8a20-6362e704d896",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~aa22a374-a475-438e-8e72-f53d0c54b71d",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~facfd972-ce08-4a01-a96f-e2e22b528bdd",
            editionId: "8eaccb98-1f8c-4a18-be08-529471ed7d24",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:12:51.115391000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:12:51.115391000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/operated-by/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:51.115391000Z",
            createdAtDecisionTime: "2026-01-30T13:12:51.115391000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:51.115391000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:51.115391000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:12:48.745000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~9336ee48-7a95-4a5e-a3e0-2659e5c042fc",
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~c5204f34-ee54-4a3a-83e4-6e87f8c5cd4f": {
    "2026-01-30T13:11:16.890952000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/iata-code/": "DND",
          "https://hash.ai/@h/types/property-type/city/": "Dundee",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "Dundee",
          "https://hash.ai/@h/types/property-type/timezone/": "Europe/London",
          "https://hash.ai/@h/types/property-type/icao-code/": "EGPN",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~c5204f34-ee54-4a3a-83e4-6e87f8c5cd4f",
            editionId: "48f185ee-5c9f-4b7b-8eb8-6664c256c4fb",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:16.890952000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:16.890952000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:11:16.890952000Z",
            createdAtDecisionTime: "2026-01-30T13:11:16.890952000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:11:16.890952000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:11:16.890952000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:11:16.491000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~a5731087-661d-44c8-8647-e849b3cf59ce",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/city/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Dundee",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/timezone/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Europe/London",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "DND",
                  },
                },
              },
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:11:16.491000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "Dundee",
                    },
                  },
                },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "EGPN",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~f54ac8cc-3aca-4308-9173-7b724b387669": {
    "2026-01-30T13:44:11.401882000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T14:34:00Z",
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": -60,
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T14:35:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T14:25:00Z",
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T14:24:00Z",
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~189c9c30-d44b-4eb4-8dd6-fe866a904b4b",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~be6f15d4-3439-4318-beda-443f6001cd03",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~f54ac8cc-3aca-4308-9173-7b724b387669",
            editionId: "0c44d5f9-be61-4814-8f84-7f8c2553db5b",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.401882000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.401882000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/arrives-at/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:51.291261000Z",
            createdAtDecisionTime: "2026-01-30T13:12:51.291261000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:51.291261000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:51.291261000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": -60,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T14:35:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T14:24:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T14:34:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T14:25:00Z",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~4b269bfb-9ae2-4e83-8a24-32c7e5e19800": {
    "2026-01-30T13:44:10.623578000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/city/": "London",
          "https://hash.ai/@h/types/property-type/icao-code/": "EGSS",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "London Stansted",
          "https://hash.ai/@h/types/property-type/timezone/": "Europe/London",
          "https://hash.ai/@h/types/property-type/iata-code/": "STN",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~4b269bfb-9ae2-4e83-8a24-32c7e5e19800",
            editionId: "3fdcb0c3-c7e5-4f70-9761-310be60321c7",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.623578000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.623578000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.339861000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.339861000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.339861000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.339861000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "EGSS",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/city/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "London",
                  },
                },
              },
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:44:06.036000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "London Stansted",
                    },
                  },
                },
              "https://hash.ai/@h/types/property-type/timezone/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Europe/London",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "STN",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~c71304e5-9d30-45b3-b1fb-de47332e079d": {
    "2026-01-30T13:12:51.722601000Z": {
      kind: "entity",
      inner: {
        properties: {},
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~351ef377-1b7e-45bd-b6b5-b773c8f0d55a",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~0b1a967b-8e33-4ff1-80b1-1557f4bbb7bf",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~c71304e5-9d30-45b3-b1fb-de47332e079d",
            editionId: "b0a621f9-53b2-4c37-9097-7ed3e667353d",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:12:51.722601000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:12:51.722601000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/operated-by/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:51.722601000Z",
            createdAtDecisionTime: "2026-01-30T13:12:51.722601000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:51.722601000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:51.722601000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:12:48.745000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~9336ee48-7a95-4a5e-a3e0-2659e5c042fc",
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~f52f3e22-10ab-4066-8e67-6a865a176872": {
    "2026-01-30T13:44:10.331168000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/timezone/": "Europe/Dublin",
          "https://hash.ai/@h/types/property-type/iata-code/": "DUB",
          "https://hash.ai/@h/types/property-type/icao-code/": "EIDW",
          "https://hash.ai/@h/types/property-type/city/": "Dublin",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "Dublin Int'l",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~f52f3e22-10ab-4066-8e67-6a865a176872",
            editionId: "5f2b4577-c341-49e8-bf2a-7a5981cec3b7",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.331168000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.331168000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.139777000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.139777000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.139777000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.139777000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/timezone/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Europe/Dublin",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "DUB",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "EIDW",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/city/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Dublin",
                  },
                },
              },
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:44:06.036000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "Dublin Int'l",
                    },
                  },
                },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~0b1a967b-8e33-4ff1-80b1-1557f4bbb7bf": {
    "2026-01-30T13:44:10.697985000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/icao-code/": "RUK",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "RUK",
          "https://hash.ai/@h/types/property-type/iata-code/": "RK",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~0b1a967b-8e33-4ff1-80b1-1557f4bbb7bf",
            editionId: "2f18ec82-85e0-4b74-9093-aaf7eccfee14",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.697985000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.697985000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airline/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.408993000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.408993000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.408993000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.408993000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:44:06.036000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "RUK",
                    },
                  },
                },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "RK",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "RUK",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~c1312eb5-2bc6-4aca-a09a-98a09a036af9": {
    "2026-01-30T13:44:11.536058000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T14:05:00Z",
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T14:05:00Z",
          "https://hash.ai/@h/types/property-type/gate/": "85",
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": 0,
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T14:15:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T14:15:00Z",
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~351ef377-1b7e-45bd-b6b5-b773c8f0d55a",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~4b269bfb-9ae2-4e83-8a24-32c7e5e19800",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~c1312eb5-2bc6-4aca-a09a-98a09a036af9",
            editionId: "d14e5baf-95ea-4ba3-a686-08edfe5d7ed3",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.536058000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.536058000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/departs-from/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:51.473570000Z",
            createdAtDecisionTime: "2026-01-30T13:12:51.473570000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:51.473570000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:51.473570000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T14:15:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T14:05:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/gate/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "85",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": 0,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T14:05:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T14:15:00Z",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~6052719f-7dfe-42a2-8a6c-a649a30a37db": {
    "2026-01-30T13:44:11.034163000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T10:15:00Z",
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": 0,
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T10:15:00Z",
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T10:10:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T10:10:00Z",
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~42c57e8b-8912-430c-b8d1-8aee077ae28f",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~bd19cd95-ac63-4948-b03a-108c02ed6da3",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~6052719f-7dfe-42a2-8a6c-a649a30a37db",
            editionId: "922008e7-6869-4f89-b2d7-415013902387",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.034163000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.034163000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/departs-from/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.474769000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.474769000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.474769000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.474769000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T10:10:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T10:15:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T10:10:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": 0,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T10:15:00Z",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~189c9c30-d44b-4eb4-8dd6-fe866a904b4b": {
    "2026-01-30T13:44:13.943303000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/flight-date/": "2026-01-30",
          "https://hash.ai/@h/types/property-type/flight-status/": "Active",
          "https://hash.ai/@h/types/property-type/longitude/": -6.28369,
          "https://hash.ai/@h/types/property-type/iata-code/": "FR4784",
          "https://hash.ai/@h/types/property-type/latitude/": 53.42384,
          "https://hash.ai/@h/types/property-type/ground-speed/": 0,
          "https://hash.ai/@h/types/property-type/is-on-ground/": true,
          "https://hash.ai/@h/types/property-type/flight-number/": "FR4784",
          "https://hash.ai/@h/types/property-type/icao-code/": "RYR4784",
          "https://hash.ai/@h/types/property-type/vertical-speed/": 0,
          "https://hash.ai/@h/types/property-type/altitude/": 0,
          "https://hash.ai/@h/types/property-type/direction/": 275,
          "https://hash.ai/@h/types/property-type/flight-type/": "Airline",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~189c9c30-d44b-4eb4-8dd6-fe866a904b4b",
            editionId: "d927a169-8ce3-415a-bd6d-97714d6362a2",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:13.943303000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:13.943303000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/flight/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.064864000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.064864000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.064864000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.064864000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "Flightradar24 API",
                    uri: "https://fr24api.flightradar24.com/api/",
                  },
                  loadedAt: "2026-01-30T13:44:12.683000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["4"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/flight-status/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/flight-status/":
                      "Active",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/is-on-ground/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.683000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/": true,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-number/": {
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "FR4784",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/vertical-speed/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.683000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://hash.ai/@h/types/data-type/feet-per-minute/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/feet-per-minute/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/meters-per-second/": 0,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-date/": {
                metadata: {
                  dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/date/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/date/": "2026-01-30",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "FR4784",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-type/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Airline",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/altitude/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.683000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/meters/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/meters/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/meters/": 0,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/direction/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.683000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/degree/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/degree/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/degree/": 275,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "RYR4784",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/latitude/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.683000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/latitude/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/latitude/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/latitude/": 53.42384,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/ground-speed/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.683000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/knots/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/knots/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/meters-per-second/": 0,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/longitude/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.683000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://hash.ai/@h/types/data-type/longitude/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/longitude/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/longitude/": -6.28369,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~d829e785-c35e-4371-b866-ea5d52ff399e": {
    "2026-01-30T13:44:10.434282000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "RYR",
          "https://hash.ai/@h/types/property-type/icao-code/": "RYR",
          "https://hash.ai/@h/types/property-type/iata-code/": "FR",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~d829e785-c35e-4371-b866-ea5d52ff399e",
            editionId: "f68bea6f-68a8-46f3-8c18-fcd9cdfe00c9",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.434282000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.434282000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airline/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.208791000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.208791000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.208791000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.208791000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "FR",
                  },
                },
              },
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:44:06.036000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "RYR",
                    },
                  },
                },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "RYR",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~6eff871a-71b7-498d-bbc6-c18a25da150b": {
    "2026-01-30T13:11:17.025890000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T18:30:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T18:30:00Z",
          "https://hash.ai/@h/types/property-type/gate/": "A5",
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": 0,
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T18:20:00Z",
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T18:20:00Z",
          "https://hash.ai/@h/types/property-type/terminal/": "2",
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~d915d524-ece1-4981-83e8-bedeee7f0019",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~5f305e8d-28ef-476c-b438-7e5edca178c2",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~6eff871a-71b7-498d-bbc6-c18a25da150b",
            editionId: "6fa5cabf-4d4b-49c3-9bda-98e19a268d12",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:17.025890000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:17.025890000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/departs-from/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:11:17.025890000Z",
            createdAtDecisionTime: "2026-01-30T13:11:17.025890000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:11:17.025890000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:11:17.025890000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:11:16.491000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~a5731087-661d-44c8-8647-e849b3cf59ce",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T18:20:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T18:30:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/gate/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "A5",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/terminal/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "2",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": 0,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T18:20:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T18:30:00Z",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~1031ed87-1dee-4e03-9ff8-ad250210cdef": {
    "2026-01-30T13:44:11.802464000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T15:20:00Z",
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T15:10:00Z",
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": 0,
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T15:20:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T15:10:00Z",
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~351ef377-1b7e-45bd-b6b5-b773c8f0d55a",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~be6f15d4-3439-4318-beda-443f6001cd03",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~1031ed87-1dee-4e03-9ff8-ad250210cdef",
            editionId: "2f3ea2ec-314e-41f8-b987-d2e0ad5e8379",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.802464000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:11.802464000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/arrives-at/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:51.616369000Z",
            createdAtDecisionTime: "2026-01-30T13:12:51.616369000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:51.616369000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:51.616369000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T15:20:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": 0,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T15:20:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T15:10:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T15:10:00Z",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~9e359179-4ef7-4418-b8ff-e3b17531e704": {
    "2026-01-30T13:44:10.776544000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T12:20:00Z",
          "https://hash.ai/@h/types/property-type/actual-gate-time/":
            "2026-01-30T12:33:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T12:20:00Z",
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T12:48:47Z",
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": 780,
          "https://hash.ai/@h/types/property-type/terminal/": "2",
          "https://hash.ai/@h/types/property-type/gate/": "B3",
          "https://hash.ai/@h/types/property-type/actual-runway-time/":
            "2026-01-30T12:48:47Z",
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T12:30:00Z",
          "https://hash.ai/@h/types/property-type/runway/": "05L",
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~46ad3ba6-6629-49c3-8a20-6362e704d896",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~e01cadf2-cf34-462b-a489-9d57f4bd171d",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~9e359179-4ef7-4418-b8ff-e3b17531e704",
            editionId: "a337db5d-6cad-49a4-a322-6723041709ef",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.776544000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.776544000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/departs-from/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.884313000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.884313000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.884313000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.884313000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T12:20:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T12:48:47Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/actual-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T12:33:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/actual-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T12:48:47Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/gate/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "B3",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/terminal/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "2",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T12:30:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": 780,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T12:20:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/runway/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "05L",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~0c16f081-3d98-4b87-baff-2d3ae26268db": {
    "2026-01-30T13:12:50.797099000Z": {
      kind: "entity",
      inner: {
        properties: {},
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~42c57e8b-8912-430c-b8d1-8aee077ae28f",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~1d09bb22-2266-49a6-bbaa-d1c770f20fb5",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~0c16f081-3d98-4b87-baff-2d3ae26268db",
            editionId: "65947871-bf35-481d-aadc-e565f573451d",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:12:50.797099000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:12:50.797099000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/operated-by/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:50.797099000Z",
            createdAtDecisionTime: "2026-01-30T13:12:50.797099000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:50.797099000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:50.797099000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:12:48.745000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~9336ee48-7a95-4a5e-a3e0-2659e5c042fc",
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~1d09bb22-2266-49a6-bbaa-d1c770f20fb5": {
    "2026-01-30T13:44:10.143988000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/icao-code/": "AAV",
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            "AAV",
          "https://hash.ai/@h/types/property-type/iata-code/": "8Y",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~1d09bb22-2266-49a6-bbaa-d1c770f20fb5",
            editionId: "8ba6e81d-7dbf-415c-9b75-c8cce8b9281e",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.143988000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:10.143988000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/airline/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:49.764560000Z",
            createdAtDecisionTime: "2026-01-30T13:12:49.764560000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:49.764560000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:49.764560000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:44:06.036000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "8Y",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "AAV",
                  },
                },
              },
              "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
                {
                  metadata: {
                    provenance: {
                      sources: [
                        {
                          type: "integration",
                          location: {
                            name: "FlightAware AeroAPI",
                            uri: "https://aeroapi.flightaware.com/aeroapi/",
                          },
                          loadedAt: "2026-01-30T13:44:06.036000000Z",
                        },
                      ],
                    },
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    originalDataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    canonical: {
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                        "AAV",
                    },
                  },
                },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~82eaf62a-f066-4e55-99f3-03043be53ec9": {
    "2026-01-30T13:11:17.129645000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/estimated-gate-time/":
            "2026-01-30T20:10:00Z",
          "https://hash.ai/@h/types/property-type/delay-in-seconds/": 0,
          "https://hash.ai/@h/types/property-type/scheduled-runway-time/":
            "2026-01-30T20:00:00Z",
          "https://hash.ai/@h/types/property-type/scheduled-gate-time/":
            "2026-01-30T20:10:00Z",
          "https://hash.ai/@h/types/property-type/estimated-runway-time/":
            "2026-01-30T20:00:00Z",
        },
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~d915d524-ece1-4981-83e8-bedeee7f0019",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~c5204f34-ee54-4a3a-83e4-6e87f8c5cd4f",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~82eaf62a-f066-4e55-99f3-03043be53ec9",
            editionId: "8d19ff8e-e972-4287-b1ed-3968eafd1176",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:17.129645000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:11:17.129645000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/arrives-at/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:11:17.129645000Z",
            createdAtDecisionTime: "2026-01-30T13:11:17.129645000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:11:17.129645000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:11:17.129645000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:11:16.491000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~a5731087-661d-44c8-8647-e849b3cf59ce",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T20:10:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/integer/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/integer/": 0,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T20:00:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T20:10:00Z",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:11:16.491000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/datetime/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/datetime/":
                      "2026-01-30T20:00:00Z",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~46ad3ba6-6629-49c3-8a20-6362e704d896": {
    "2026-01-30T13:44:14.167484000Z": {
      kind: "entity",
      inner: {
        properties: {
          "https://hash.ai/@h/types/property-type/direction/": 218,
          "https://hash.ai/@h/types/property-type/flight-date/": "2026-01-30",
          "https://hash.ai/@h/types/property-type/flight-status/": "Active",
          "https://hash.ai/@h/types/property-type/latitude/": 50.54554,
          "https://hash.ai/@h/types/property-type/vertical-speed/": -832,
          "https://hash.ai/@h/types/property-type/flight-number/": "LM21",
          "https://hash.ai/@h/types/property-type/is-on-ground/": false,
          "https://hash.ai/@h/types/property-type/ground-speed/": 176,
          "https://hash.ai/@h/types/property-type/flight-type/": "Airline",
          "https://hash.ai/@h/types/property-type/codeshare/": [
            {
              "https://hash.ai/@h/types/property-type/icao-code/": "BAW7821",
              "https://hash.ai/@h/types/property-type/iata-code/": "BA7821",
            },
          ],
          "https://hash.ai/@h/types/property-type/longitude/": -5.15786,
          "https://hash.ai/@h/types/property-type/altitude/": 1181.1,
          "https://hash.ai/@h/types/property-type/iata-code/": "LM21",
          "https://hash.ai/@h/types/property-type/icao-code/": "LOG21",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~46ad3ba6-6629-49c3-8a20-6362e704d896",
            editionId: "f7530aec-7d9a-4573-812e-c5457a729cf6",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:14.167484000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:44:14.167484000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: ["https://hash.ai/@h/types/entity-type/flight/v/1"],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:49.825793000Z",
            createdAtDecisionTime: "2026-01-30T13:12:49.825793000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:49.825793000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:49.825793000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "Flightradar24 API",
                    uri: "https://fr24api.flightradar24.com/api/",
                  },
                  loadedAt: "2026-01-30T13:44:12.896000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["4"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~00c2f364-810b-4af2-b57a-799fc3525ddc",
              },
            },
          },
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/flight-type/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "Airline",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/latitude/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.896000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/latitude/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/latitude/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/latitude/": 50.54554,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/direction/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.896000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/degree/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/degree/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/degree/": 218,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/codeshare/": {
                value: [
                  {
                    value: {
                      "https://hash.ai/@h/types/property-type/iata-code/": {
                        metadata: {
                          provenance: {
                            sources: [
                              {
                                type: "integration",
                                location: {
                                  name: "FlightAware AeroAPI",
                                  uri: "https://aeroapi.flightaware.com/aeroapi/",
                                },
                                loadedAt: "2026-01-30T13:44:06.036000000Z",
                              },
                            ],
                          },
                          dataTypeId:
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                          originalDataTypeId:
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                          canonical: {
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                              "BA7821",
                          },
                        },
                      },
                      "https://hash.ai/@h/types/property-type/icao-code/": {
                        metadata: {
                          provenance: {
                            sources: [
                              {
                                type: "integration",
                                location: {
                                  name: "FlightAware AeroAPI",
                                  uri: "https://aeroapi.flightaware.com/aeroapi/",
                                },
                                loadedAt: "2026-01-30T13:44:06.036000000Z",
                              },
                            ],
                          },
                          dataTypeId:
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                          originalDataTypeId:
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                          canonical: {
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                              "BAW7821",
                          },
                        },
                      },
                    },
                  },
                ],
              },
              "https://hash.ai/@h/types/property-type/iata-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "LM21",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/altitude/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.896000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/meters/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/meters/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/meters/": 1181.1,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/longitude/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.896000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://hash.ai/@h/types/data-type/longitude/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/longitude/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/longitude/": -5.15786,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-number/": {
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "LM21",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/ground-speed/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.896000000Z",
                      },
                    ],
                  },
                  dataTypeId: "https://hash.ai/@h/types/data-type/knots/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/knots/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/meters-per-second/": 90.5422222222222,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/icao-code/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/":
                      "LOG21",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/is-on-ground/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.896000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
                  originalDataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
                  canonical: {
                    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/": false,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-status/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "FlightAware AeroAPI",
                          uri: "https://aeroapi.flightaware.com/aeroapi/",
                        },
                        loadedAt: "2026-01-30T13:44:06.036000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/flight-status/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/flight-status/":
                      "Active",
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/vertical-speed/": {
                metadata: {
                  provenance: {
                    sources: [
                      {
                        type: "integration",
                        location: {
                          name: "Flightradar24 API",
                          uri: "https://fr24api.flightradar24.com/api/",
                        },
                        loadedAt: "2026-01-30T13:44:12.896000000Z",
                      },
                    ],
                  },
                  dataTypeId:
                    "https://hash.ai/@h/types/data-type/feet-per-minute/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/feet-per-minute/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/meters-per-second/":
                      -4.22656,
                  },
                },
              },
              "https://hash.ai/@h/types/property-type/flight-date/": {
                metadata: {
                  dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
                  originalDataTypeId:
                    "https://hash.ai/@h/types/data-type/date/v/1",
                  canonical: {
                    "https://hash.ai/@h/types/data-type/date/": "2026-01-30",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "d4e19f55-faa3-4de7-a8ab-786e4219c977~e889380e-5ae0-4d07-bafb-3d1d7117c393": {
    "2026-01-30T13:12:51.386591000Z": {
      kind: "entity",
      inner: {
        properties: {},
        linkData: {
          leftEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~189c9c30-d44b-4eb4-8dd6-fe866a904b4b",
          rightEntityId:
            "d4e19f55-faa3-4de7-a8ab-786e4219c977~d829e785-c35e-4371-b866-ea5d52ff399e",
        },
        metadata: {
          recordId: {
            entityId:
              "d4e19f55-faa3-4de7-a8ab-786e4219c977~e889380e-5ae0-4d07-bafb-3d1d7117c393",
            editionId: "026818a1-0509-43ac-89d3-22c9d3d8dc57",
          },
          temporalVersioning: {
            decisionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:12:51.386591000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: "2026-01-30T13:12:51.386591000Z",
              },
              end: {
                kind: "unbounded",
              },
            },
          },
          entityTypeIds: [
            "https://hash.ai/@h/types/entity-type/operated-by/v/1",
          ],
          archived: false,
          provenance: {
            createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
            createdAtTransactionTime: "2026-01-30T13:12:51.386591000Z",
            createdAtDecisionTime: "2026-01-30T13:12:51.386591000Z",
            firstNonDraftCreatedAtTransactionTime:
              "2026-01-30T13:12:51.386591000Z",
            firstNonDraftCreatedAtDecisionTime:
              "2026-01-30T13:12:51.386591000Z",
            edition: {
              createdById: "d4e19f55-faa3-4de7-a8ab-786e4219c977",
              sources: [
                {
                  type: "integration",
                  location: {
                    name: "FlightAware AeroAPI",
                    uri: "https://aeroapi.flightaware.com/aeroapi/",
                  },
                  loadedAt: "2026-01-30T13:12:48.745000000Z",
                },
              ],
              actorType: "machine",
              origin: {
                type: "flow",
                stepIds: ["2"],
                id: "d4e19f55-faa3-4de7-a8ab-786e4219c977~9336ee48-7a95-4a5e-a3e0-2659e5c042fc",
              },
            },
          },
        },
      },
    },
  },
};

type FlightWithLinksResolved = {
  flight: Entity<Flight>;
  arrivalAirport: Entity<Airport>;
  arrivalStatus: LinkEntity<ArrivesAt>;
  departureAirport: Entity<Airport>;
  departureStatus: LinkEntity<DepartsFrom>;
  operatedBy: Entity<Airline>;
  usesAircraft: Entity<Aircraft> | null;
};

// Entity type IDs
const FLIGHT_TYPE = "https://hash.ai/@h/types/entity-type/flight/v/1";
const ARRIVES_AT_TYPE = "https://hash.ai/@h/types/entity-type/arrives-at/v/1";
const DEPARTS_FROM_TYPE =
  "https://hash.ai/@h/types/entity-type/departs-from/v/1";
const OPERATED_BY_TYPE = "https://hash.ai/@h/types/entity-type/operated-by/v/1";
const USES_AIRCRAFT_TYPE =
  "https://hash.ai/@h/types/entity-type/uses-aircraft/v/1";

type VertexEntity = (typeof vertices)[keyof typeof vertices];

/**
 * Extract the latest version of an entity from a vertex entry
 */
const getLatestEntity = (
  vertex: VertexEntity,
): { kind: "entity"; inner: unknown } | null => {
  const timestamps = Object.keys(vertex).sort().reverse();
  const latestTimestamp = timestamps[0];
  if (!latestTimestamp) {
    return null;
  }
  return vertex[latestTimestamp as keyof typeof vertex] as {
    kind: "entity";
    inner: unknown;
  };
};

/**
 * Get the entity type IDs from an entity's inner structure
 */
const getEntityTypeIds = (inner: unknown): string[] => {
  const metadata = (inner as { metadata?: { entityTypeIds?: string[] } })
    .metadata;
  return metadata?.entityTypeIds ?? [];
};

/**
 * Get the link data from an entity's inner structure
 */
const getLinkData = (
  inner: unknown,
): { leftEntityId: string; rightEntityId: string } | null => {
  const linkData = (
    inner as { linkData?: { leftEntityId: string; rightEntityId: string } }
  ).linkData;
  return linkData ?? null;
};

/**
 * Build an Entity object from the inner structure
 */
const buildEntity = (inner: unknown): Entity => {
  const typedInner = inner as {
    properties: Record<string, unknown>;
    metadata: {
      recordId: { entityId: string; editionId: string };
      entityTypeIds: string[];
      temporalVersioning: unknown;
      provenance: unknown;
      archived: boolean;
      properties: unknown;
    };
  };

  return {
    properties: typedInner.properties,
    metadata: typedInner.metadata,
  } as Entity;
};

/**
 * Build a LinkEntity object from the inner structure
 */
const buildLinkEntity = (inner: unknown): LinkEntity => {
  const typedInner = inner as {
    properties: Record<string, unknown>;
    linkData: { leftEntityId: string; rightEntityId: string };
    metadata: {
      recordId: { entityId: string; editionId: string };
      entityTypeIds: string[];
      temporalVersioning: unknown;
      provenance: unknown;
      archived: boolean;
      properties: unknown;
    };
  };

  return {
    properties: typedInner.properties,
    linkData: typedInner.linkData,
    metadata: typedInner.metadata,
  } as LinkEntity;
};

// Build lookup maps
const entitiesByType = new Map<
  string,
  { entityId: string; inner: unknown }[]
>();
const entitiesById = new Map<string, unknown>();
const linksByLeftEntityAndType = new Map<
  string,
  { entityId: string; inner: unknown }[]
>();

// Process all vertices
for (const [entityId, vertex] of Object.entries(vertices)) {
  const entityData = getLatestEntity(vertex as VertexEntity);
  if (!entityData) {
    continue;
  }

  const inner = entityData.inner;
  const typeIds = getEntityTypeIds(inner);

  // Store in entities by ID map
  entitiesById.set(entityId, inner);

  // Store in entities by type map
  for (const typeId of typeIds) {
    const existing = entitiesByType.get(typeId) ?? [];
    existing.push({ entityId, inner });
    entitiesByType.set(typeId, existing);
  }

  // If it's a link entity, store by left entity ID and type
  const linkData = getLinkData(inner);
  if (linkData) {
    for (const typeId of typeIds) {
      const key = `${linkData.leftEntityId}:${typeId}`;
      const existing = linksByLeftEntityAndType.get(key) ?? [];
      existing.push({ entityId, inner });
      linksByLeftEntityAndType.set(key, existing);
    }
  }
}

/**
 * Find a link entity by left entity ID and link type
 */
const findLinkByLeftEntityAndType = (
  leftEntityId: string,
  linkType: string,
): { entityId: string; inner: unknown } | undefined => {
  const key = `${leftEntityId}:${linkType}`;
  const links = linksByLeftEntityAndType.get(key);
  return links?.[0];
};

/**
 * Get an entity by its ID
 */
const getEntityById = (entityId: string): unknown => {
  return entitiesById.get(entityId);
};

// Build the FlightWithLinksResolved array
const flights = entitiesByType.get(FLIGHT_TYPE) ?? [];

export const flightsWithLinksResolved: FlightWithLinksResolved[] = flights
  .map(({ entityId: flightEntityId, inner: flightInner }) => {
    // Find arrives-at link and arrival airport
    const arrivesAtLink = findLinkByLeftEntityAndType(
      flightEntityId,
      ARRIVES_AT_TYPE,
    );
    if (!arrivesAtLink) {
      return null;
    }
    const arrivesAtLinkData = getLinkData(arrivesAtLink.inner);
    if (!arrivesAtLinkData) {
      return null;
    }
    const arrivalAirportInner = getEntityById(arrivesAtLinkData.rightEntityId);
    if (!arrivalAirportInner) {
      return null;
    }

    // Find departs-from link and departure airport
    const departsFromLink = findLinkByLeftEntityAndType(
      flightEntityId,
      DEPARTS_FROM_TYPE,
    );
    if (!departsFromLink) {
      return null;
    }
    const departsFromLinkData = getLinkData(departsFromLink.inner);
    if (!departsFromLinkData) {
      return null;
    }
    const departureAirportInner = getEntityById(
      departsFromLinkData.rightEntityId,
    );
    if (!departureAirportInner) {
      return null;
    }

    // Find operated-by link and airline
    const operatedByLink = findLinkByLeftEntityAndType(
      flightEntityId,
      OPERATED_BY_TYPE,
    );
    if (!operatedByLink) {
      return null;
    }
    const operatedByLinkData = getLinkData(operatedByLink.inner);
    if (!operatedByLinkData) {
      return null;
    }
    const airlineInner = getEntityById(operatedByLinkData.rightEntityId);
    if (!airlineInner) {
      return null;
    }

    // Find uses-aircraft link and aircraft (optional)
    const usesAircraftLink = findLinkByLeftEntityAndType(
      flightEntityId,
      USES_AIRCRAFT_TYPE,
    );
    let aircraftEntity: Entity<Aircraft> | null = null;
    if (usesAircraftLink) {
      const usesAircraftLinkData = getLinkData(usesAircraftLink.inner);
      if (usesAircraftLinkData) {
        const aircraftInner = getEntityById(usesAircraftLinkData.rightEntityId);
        if (aircraftInner) {
          aircraftEntity = buildEntity(aircraftInner) as Entity<Aircraft>;
        }
      }
    }

    return {
      flight: buildEntity(flightInner) as Entity<Flight>,
      arrivalAirport: buildEntity(arrivalAirportInner) as Entity<Airport>,
      arrivalStatus: buildLinkEntity(
        arrivesAtLink.inner,
      ) as LinkEntity<ArrivesAt>,
      departureAirport: buildEntity(departureAirportInner) as Entity<Airport>,
      departureStatus: buildLinkEntity(
        departsFromLink.inner,
      ) as LinkEntity<DepartsFrom>,
      operatedBy: buildEntity(airlineInner) as Entity<Airline>,
      usesAircraft: aircraftEntity,
    };
  })
  .filter((item): item is FlightWithLinksResolved => item !== null);
