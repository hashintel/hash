/**
 * Fixture: Dereferenced Person Entity Type
 *
 * This is a pre-computed dereferenced entity type for testing without Graph API.
 * Based on https://hash.ai/@h/types/entity-type/person/v/1
 *
 * The dereferenced format has all $ref pointers resolved to inline definitions,
 * making it self-contained for LLM consumption.
 *
 * Properties:
 * - name: Full name of the person
 * - email: Email address
 * - bio: Short biography
 * - website-url: Personal website URL
 * - location: Geographic location
 * - date-of-birth: Birth date
 *
 * Used for NER extraction of people mentioned in text.
 */
export const dereferencedPersonType = {
  isLink: false,
  parentIds: ["https://hash.ai/@h/types/entity-type/person/v/1"],
  schema: {
    $id: "https://hash.ai/@h/types/entity-type/person/v/1",
    title: "Person",
    description:
      "A human being, whether living, dead, or fictional. Use this type when you encounter references to individuals by name, role, or title.",
    labelProperty: "https://hash.ai/@h/types/property-type/name/",
    links: {},
    properties: {
      name: {
        $id: "https://hash.ai/@h/types/property-type/name/v/1",
        title: "Name",
        description: "The full name of a person or entity.",
        oneOf: [
          {
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            title: "Text",
            description: "An ordered sequence of characters",
            type: "string",
          },
        ],
      },
      email: {
        $id: "https://hash.ai/@h/types/property-type/email/v/1",
        title: "Email",
        description: "An email address.",
        oneOf: [
          {
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            title: "Text",
            description: "An ordered sequence of characters",
            type: "string",
          },
        ],
      },
      bio: {
        $id: "https://hash.ai/@h/types/property-type/bio/v/1",
        title: "Bio",
        description: "A short biography or description of a person.",
        oneOf: [
          {
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            title: "Text",
            description: "An ordered sequence of characters",
            type: "string",
          },
        ],
      },
      "website-url": {
        $id: "https://hash.ai/@h/types/property-type/website-url/v/1",
        title: "Website URL",
        description: "A URL pointing to a website.",
        oneOf: [
          {
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            title: "Text",
            description: "An ordered sequence of characters",
            type: "string",
          },
        ],
      },
      location: {
        $id: "https://hash.ai/@h/types/property-type/location/v/1",
        title: "Location",
        description: "A geographic location (city, country, address, etc.).",
        oneOf: [
          {
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            title: "Text",
            description: "An ordered sequence of characters",
            type: "string",
          },
        ],
      },
      "date-of-birth": {
        $id: "https://hash.ai/@h/types/property-type/date-of-birth/v/1",
        title: "Date of Birth",
        description: "The date on which a person was born.",
        oneOf: [
          {
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            title: "Text",
            description: "An ordered sequence of characters",
            type: "string",
          },
        ],
      },
      "job-title": {
        $id: "https://hash.ai/@h/types/property-type/job-title/v/1",
        title: "Job Title",
        description: "A person's professional title or role.",
        oneOf: [
          {
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            title: "Text",
            description: "An ordered sequence of characters",
            type: "string",
          },
        ],
      },
    },
    additionalProperties: false,
  },
  simplifiedPropertyTypeMappings: {
    name: "https://hash.ai/@h/types/property-type/name/",
    email: "https://hash.ai/@h/types/property-type/email/",
    bio: "https://hash.ai/@h/types/property-type/bio/",
    "website-url": "https://hash.ai/@h/types/property-type/website-url/",
    location: "https://hash.ai/@h/types/property-type/location/",
    "date-of-birth": "https://hash.ai/@h/types/property-type/date-of-birth/",
    "job-title": "https://hash.ai/@h/types/property-type/job-title/",
  },
  reverseSimplifiedPropertyTypeMappings: {
    "https://hash.ai/@h/types/property-type/name/": "name",
    "https://hash.ai/@h/types/property-type/email/": "email",
    "https://hash.ai/@h/types/property-type/bio/": "bio",
    "https://hash.ai/@h/types/property-type/website-url/": "website-url",
    "https://hash.ai/@h/types/property-type/location/": "location",
    "https://hash.ai/@h/types/property-type/date-of-birth/": "date-of-birth",
    "https://hash.ai/@h/types/property-type/job-title/": "job-title",
  },
} as const;
