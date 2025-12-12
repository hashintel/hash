/**
 * Fixture: Dereferenced Organization Schema
 *
 * This is a pre-computed dereferenced entity type schema for testing without Graph API.
 * Based on https://hash.ai/@h/types/entity-type/organization/v/3
 *
 * The dereferenced format has all $ref pointers resolved to inline definitions,
 * making it self-contained for LLM consumption.
 *
 * Properties:
 * - organization-name: Official name of the organization
 * - description: Description of what the organization does
 * - website-url: Official website
 * - location: Headquarters location
 * - founded-on: Date of founding
 * - industry: Industry sector
 *
 * Used for NER extraction of companies, institutions, and other organizations.
 */
export const dereferencedOrganizationSchema = {
  isLink: false,
  parentIds: ['https://hash.ai/@h/types/entity-type/organization/v/3'],
  schema: {
    $id: 'https://hash.ai/@h/types/entity-type/organization/v/3',
    title: 'Organization',
    description:
      'A company, institution, non-profit, government body, or any other organized group of people working toward a common purpose.',
    labelProperty: 'https://hash.ai/@h/types/property-type/organization-name/',
    links: {},
    properties: {
      'organization-name': {
        $id: 'https://hash.ai/@h/types/property-type/organization-name/v/1',
        title: 'Organization Name',
        description: 'The official name of an organization.',
        oneOf: [
          {
            $id: 'https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1',
            title: 'Text',
            description: 'An ordered sequence of characters',
            type: 'string',
          },
        ],
      },
      description: {
        $id: 'https://hash.ai/@h/types/property-type/description/v/1',
        title: 'Description',
        description: 'A description of what the organization does or is.',
        oneOf: [
          {
            $id: 'https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1',
            title: 'Text',
            description: 'An ordered sequence of characters',
            type: 'string',
          },
        ],
      },
      'website-url': {
        $id: 'https://hash.ai/@h/types/property-type/website-url/v/1',
        title: 'Website URL',
        description: 'The official website URL of the organization.',
        oneOf: [
          {
            $id: 'https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1',
            title: 'Text',
            description: 'An ordered sequence of characters',
            type: 'string',
          },
        ],
      },
      location: {
        $id: 'https://hash.ai/@h/types/property-type/location/v/1',
        title: 'Location',
        description: 'The headquarters or primary location of the organization.',
        oneOf: [
          {
            $id: 'https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1',
            title: 'Text',
            description: 'An ordered sequence of characters',
            type: 'string',
          },
        ],
      },
      'founded-on': {
        $id: 'https://hash.ai/@h/types/property-type/founded-on/v/1',
        title: 'Founded On',
        description: 'The date when the organization was founded.',
        oneOf: [
          {
            $id: 'https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1',
            title: 'Text',
            description: 'An ordered sequence of characters',
            type: 'string',
          },
        ],
      },
      industry: {
        $id: 'https://hash.ai/@h/types/property-type/industry/v/1',
        title: 'Industry',
        description: 'The industry or sector the organization operates in.',
        oneOf: [
          {
            $id: 'https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1',
            title: 'Text',
            description: 'An ordered sequence of characters',
            type: 'string',
          },
        ],
      },
      shortname: {
        $id: 'https://hash.ai/@h/types/property-type/shortname/v/1',
        title: 'Shortname',
        description: "A short identifier or acronym for the organization (e.g., 'MSFT' for Microsoft).",
        oneOf: [
          {
            $id: 'https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1',
            title: 'Text',
            description: 'An ordered sequence of characters',
            type: 'string',
          },
        ],
      },
    },
    additionalProperties: false,
  },
  simplifiedPropertyTypeMappings: {
    'organization-name': 'https://hash.ai/@h/types/property-type/organization-name/',
    description: 'https://hash.ai/@h/types/property-type/description/',
    'website-url': 'https://hash.ai/@h/types/property-type/website-url/',
    location: 'https://hash.ai/@h/types/property-type/location/',
    'founded-on': 'https://hash.ai/@h/types/property-type/founded-on/',
    industry: 'https://hash.ai/@h/types/property-type/industry/',
    shortname: 'https://hash.ai/@h/types/property-type/shortname/',
  },
  reverseSimplifiedPropertyTypeMappings: {
    'https://hash.ai/@h/types/property-type/organization-name/': 'organization-name',
    'https://hash.ai/@h/types/property-type/description/': 'description',
    'https://hash.ai/@h/types/property-type/website-url/': 'website-url',
    'https://hash.ai/@h/types/property-type/location/': 'location',
    'https://hash.ai/@h/types/property-type/founded-on/': 'founded-on',
    'https://hash.ai/@h/types/property-type/industry/': 'industry',
    'https://hash.ai/@h/types/property-type/shortname/': 'shortname',
  },
} as const;
