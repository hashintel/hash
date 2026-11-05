export const integrationIconVariants = [
  "mark-mono",
  "mark-light",
  "mark-dark",
  "app-dark",
  "app-light",
  "logo-light",
  "logo-dark",
] as const;

export type IntegrationIconVariant = (typeof integrationIconVariants)[number];

export const integrationIconCatalog = [
  {
    name: "anaplan",
    slug: "anaplan",
    label: "Anaplan",
    integrationNames: ["Anaplan"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/anaplan-dark-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://www.anaplan.com/etc.clientlibs/anaplan/clientlibs/clientlib-site/resources/images/icons/logo.svg",
    logoNotes: "Official site logo",
    logoRaster: false,
  },
  {
    name: "blueYonder",
    slug: "blue-yonder",
    label: "Blue Yonder Platform",
    integrationNames: ["Blue Yonder Platform"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/blue-yonder-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource: "https://iconlogovector.com/logo/blue-yonder",
    logoNotes:
      "Blue-Yonder.svg download, credited to blueyonder.com; preserves full official lock-up",
    logoRaster: false,
  },
  {
    name: "celonis",
    slug: "celonis",
    label: "Celonis",
    integrationNames: ["Celonis"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/celonis-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource: "https://www.celonis.com/src/assets/icons/logo.svg",
    logoNotes:
      "Official site metadata logo. Lock-up composed from the sourced brand mark and wordmark.",
    logoRaster: false,
  },
  {
    name: "databricks",
    slug: "databricks",
    label: "Databricks",
    integrationNames: ["Databricks"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/databricks-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/databricks.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "snowflake",
    slug: "snowflake",
    label: "Snowflake",
    integrationNames: ["Snowflake"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/snowflake-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/snowflake.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "bigQuery",
    slug: "bigquery",
    label: "BigQuery",
    integrationNames: ["BigQuery"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/bigquery-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://i.logos-download.com/88905/33163-85dd2fe97c1155616625cc31084e3a35.svg/Google_BigQuery_Logo_2015.svg?dl=",
    logoNotes: "Archived Google BigQuery product lock-up.",
    logoRaster: false,
  },
  {
    name: "amazonRedshift",
    slug: "aws-redshift",
    label: "Amazon Redshift",
    integrationNames: ["Amazon Redshift"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/aws-redshift-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://i.logos-download.com/85987/20400--77f14a77ac89487407a2239804071413.svg/Amazon_Redshift_Logo.svg?dl=",
    logoNotes:
      "Archived Amazon Redshift product lock-up using the blue column mark shown in HASH.",
    logoRaster: false,
  },
  {
    name: "cloudflare",
    slug: "cloudflare",
    label: "Cloudflare R2",
    integrationNames: ["Cloudflare R2", "Cloudflare D1"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/cloudflare-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/cloudflare.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "azure",
    slug: "azure",
    label: "Azure Data Lake Storage",
    integrationNames: ["Azure Data Lake Storage"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/azure-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://raw.githubusercontent.com/devicons/devicon/master/icons/azure/azure-original-wordmark.svg",
    logoNotes: "Vector artwork archive",
    logoRaster: false,
  },
  {
    name: "postgres",
    slug: "postgres",
    label: "Postgres",
    integrationNames: ["Postgres"],
    source:
      "https://github.com/gilbarbara/logos/blob/master/logos/postgresql.svg",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/pheralb/svgl/blob/c0ec7ab121354ac1096b17b3aebbb293c8ce5600/static/library/postgresql-wordmark-light.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "veevaVault",
    slug: "veeva-vault",
    label: "Veeva Vault",
    integrationNames: ["Veeva Vault"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/veeva-vault-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://www.veeva.com/wp-content/themes/veeva2015/assets/veeva-2024/veeva-logo-white.svg",
    logoNotes:
      "Official Veeva corporate wordmark; no separate Vault lock-up was verified. Lock-up composed from the sourced brand mark and wordmark.",
    logoRaster: false,
  },
  {
    name: "pasX",
    slug: "pas-x",
    label: "PAS-X MES",
    integrationNames: ["PAS-X MES"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/pas-x-dark-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/pas-x-dark-icon.tsx",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "fourkites",
    slug: "fourkites",
    label: "Fourkites",
    integrationNames: ["Fourkites"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/fourkites-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource: "https://www.fourkites.com/",
    logoNotes: "Official site inline SVG header logo",
    logoRaster: false,
  },
  {
    name: "omp",
    slug: "omp",
    label: "OMP",
    integrationNames: ["OMP"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/omp-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/omp-icon.tsx",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "kinaxis",
    slug: "kinaxis",
    label: "Kinaxis",
    integrationNames: ["Kinaxis"],
    source: "https://www.kinaxis.com/themes/custom/ka/src/images/logo.svg",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource: "https://www.kinaxis.com/themes/custom/ka/src/images/logo.svg",
    logoNotes:
      "Official corporate wordmark. Red on light backgrounds and white on dark backgrounds, as shown in the Kinaxis brand guide.",
    logoRaster: false,
  },
  {
    name: "kinaxisMaestro",
    slug: "kinaxis-maestro",
    label: "Kinaxis Maestro",
    integrationNames: ["Kinaxis Maestro"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/kinaxis-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://www.kinaxis.com/sites/default/files/2026-01/knx-28926_identity_logo_rgb_horz_color-full.png",
    logoNotes:
      "Custom horizontal Maestro by Kinaxis lock-up, with the emblem to the left of the outlined wordmark. Native contours and lettering come from the official Demand Planning brochure, page 8; text proportions follow the January 2026 media-kit artwork. The PDF mesh gradient is represented by vector color patches; no raster artwork or font dependencies are embedded. Dark-mode lettering is white.",
    logoRaster: false,
  },
  {
    name: "coupa",
    slug: "coupa",
    label: "Coupa",
    integrationNames: ["Coupa"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/coupa-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://companieslogo.com/img/orig/COUP_BIG-615c6aaa.svg?t=1720244491",
    logoNotes: "Vector artwork archive",
    logoRaster: false,
  },
  {
    name: "linear",
    slug: "linear",
    label: "Linear",
    integrationNames: ["Linear"],
    source:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/linear-icon.svg",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/linear.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "slack",
    slug: "slack",
    label: "Slack",
    integrationNames: ["Slack"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/slack-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/slack.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "oracle",
    slug: "oracle",
    label: "Oracle Cloud SCM",
    integrationNames: [
      "Oracle Cloud SCM",
      "Oracle Cloud ERP",
      "Oracle Cloud EPM",
      "Oracle Cloud HCM",
    ],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/oracle-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/oracle.svg",
    logoNotes: "Lock-up composed from the sourced brand mark and wordmark.",
    logoRaster: false,
  },
  {
    name: "sap",
    slug: "sap",
    label: "SAP S/4HANA",
    integrationNames: ["SAP S/4HANA"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/sap-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/sap.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "docusign",
    slug: "docusign",
    label: "DocuSign",
    integrationNames: ["DocuSign"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/docusign-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource: "https://www.docusign.com/",
    logoNotes: "Official site inline SVG header logo",
    logoRaster: false,
  },
  {
    name: "gmail",
    slug: "google-mail",
    label: "Gmail",
    integrationNames: ["Gmail"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/google-mail-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/logo_gmail_lockup_default_2x_r5.png",
    logoNotes:
      "Official Google header lockup raster (218 x 80); transparent PNG embedded in SVG. Dark mode preserves the original icon colors and uses the same light wordmark color as Google Drive and Calendar.",
    logoRaster: true,
  },
  {
    name: "googleDrive",
    slug: "google-drive",
    label: "Google Drive",
    integrationNames: ["Google Drive"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/google-drive-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://logo-teka.com/wp-content/uploads/2025/11/google-drive-logo.svg",
    logoNotes:
      "Horizontal logo vector archive; https://logo-teka.com/en/google-drive/",
    logoRaster: false,
  },
  {
    name: "googleCalendar",
    slug: "google-calendar",
    label: "Google Calendar",
    integrationNames: ["Google Calendar"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/google-calendar-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://i.logos-download.com/77571/33116-5a2381edcc54e0ddbb48d924512790d6.svg/Google_Calendar_Logo_2020_full.svg?dl=",
    logoNotes:
      "Original full logo from public vector archive; https://logos-download.com/brands/google-calendar",
    logoRaster: false,
  },
  {
    name: "dropbox",
    slug: "dropbox",
    label: "Dropbox",
    integrationNames: ["Dropbox"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/dropbox-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/pheralb/svgl/blob/c0ec7ab121354ac1096b17b3aebbb293c8ce5600/static/library/dropbox_wordmark.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "box",
    slug: "box",
    label: "Box",
    integrationNames: ["Box"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/box-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/box.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "trello",
    slug: "trello",
    label: "Trello",
    integrationNames: ["Trello"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/trello-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/pheralb/svgl/blob/c0ec7ab121354ac1096b17b3aebbb293c8ce5600/static/library/trello-wordmark.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "appleNotes",
    slug: "apple-notes",
    label: "Apple Notes",
    integrationNames: ["Apple Notes"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/apple-notes-dark-icon.tsx",
    category: "Integrations",
    variants: ["mark-mono", "mark-light", "mark-dark", "app-dark", "app-light"],
    logoSource: null,
    logoNotes:
      "No authentic full-logo lock-up was verified. Only mark and app-tile variants are provided.",
    logoRaster: false,
  },
  {
    name: "discord",
    slug: "discord",
    label: "Discord",
    integrationNames: ["Discord"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/discord-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/discord.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "microsoftTeams",
    slug: "microsoft-teams",
    label: "Microsoft Teams",
    integrationNames: ["Microsoft Teams"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/microsoft-teams-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://info.microsoft.com/rs/157-GQE-382/images/TelefoniemitMicrosoftTeamseinberblick-SREVM22254.pdf",
    logoNotes:
      "Composed lock-up pairing the Teams product mark with the Microsoft Teams wordmark vectorized from page 1 of the official Microsoft PDF. The Microsoft corporate square is excluded. Charcoal lettering in light mode and near-white lettering in dark mode; no embedded raster artwork.",
    logoRaster: false,
  },
  {
    name: "messenger",
    slug: "messenger",
    label: "Messenger",
    integrationNames: ["Messenger"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/messenger-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://upload.wikimedia.org/wikipedia/commons/d/d0/Facebook_Messenger_wordmark_2025.svg",
    logoNotes:
      "https://commons.wikimedia.org/wiki/File:Facebook_Messenger_wordmark_2025.svg. Lock-up composed from the sourced brand mark and wordmark.",
    logoRaster: false,
  },
  {
    name: "instagram",
    slug: "instagram",
    label: "Instagram",
    integrationNames: ["Instagram"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/instagram-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/pheralb/svgl/blob/c0ec7ab121354ac1096b17b3aebbb293c8ce5600/static/library/instagram-wordmark.svg",
    logoNotes:
      "Lock-up composed from the sourced brand mark and wordmark. The wordmark is black on light backgrounds and white on dark backgrounds; the mark retains its gradient.",
    logoRaster: false,
  },
  {
    name: "notion",
    slug: "notion",
    label: "Notion",
    integrationNames: ["Notion"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/notion-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/notion.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "granola",
    slug: "granola",
    label: "Granola",
    integrationNames: ["Granola"],
    source:
      "https://github.com/pheralb/svgl/blob/c0ec7ab121354ac1096b17b3aebbb293c8ce5600/static/library/granola-light.svg",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/pheralb/svgl/blob/c0ec7ab121354ac1096b17b3aebbb293c8ce5600/static/library/granola-wordmark-light.svg",
    logoNotes:
      "Current hand-drawn swirl identity, verified against the official Granola website and February 2026 rebrand announcement. The retired mark is available separately as granolaLegacy.",
    logoRaster: false,
  },
  {
    name: "granolaLegacy",
    slug: "granola-legacy",
    label: "Granola (legacy)",
    integrationNames: [],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/granola-dark-icon.tsx",
    category: "Integrations",
    variants: ["mark-mono", "mark-light", "mark-dark", "app-dark", "app-light"],
    logoSource: null,
    logoNotes:
      "Retired g-and-cursor artwork, retained as an explicit legacy option. No verified legacy full-logo lock-up is included.",
    logoRaster: false,
  },
  {
    name: "sentry",
    slug: "sentry",
    label: "Sentry",
    integrationNames: ["Sentry"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/sentry-dark-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/sentry.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "zoom",
    slug: "zoom",
    label: "Zoom",
    integrationNames: ["Zoom"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/zoom-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/zoom.svg",
    logoNotes: "Lock-up composed from the sourced brand mark and wordmark.",
    logoRaster: false,
  },
  {
    name: "github",
    slug: "github",
    label: "GitHub",
    integrationNames: ["GitHub"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/github-dark-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/github.svg",
    logoNotes: "Lock-up composed from the sourced brand mark and wordmark.",
    logoRaster: false,
  },
  {
    name: "figma",
    slug: "figma",
    label: "Figma",
    integrationNames: ["Figma"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/figma-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://static.figma.com/uploads/4fbf4d754dbbc027ba1530205f8747cd97d532e5",
    logoNotes:
      "Official Figma Brand Assets bundle, linked from https://www.figma.com/using-the-figma-brand/",
    logoRaster: false,
  },
  {
    name: "asana",
    slug: "asana",
    label: "Asana",
    integrationNames: ["Asana"],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/asana-icon.tsx",
    category: "Integrations",
    variants: [
      "mark-mono",
      "mark-light",
      "mark-dark",
      "app-dark",
      "app-light",
      "logo-light",
      "logo-dark",
    ],
    logoSource:
      "https://github.com/gilbarbara/logos/blob/22f03ffc4a652309d1fea4ade70f46e9e1d6602c/logos/asana.svg",
    logoNotes: null,
    logoRaster: false,
  },
  {
    name: "genericApp",
    slug: "generic-app",
    label: "Other integration",
    integrationNames: [],
    source:
      "https://github.com/hashintel/internal-sites/blob/ef1c3c6faa4e58ef1db48edc41627e5e960adced/packages/integrations-catalog/src/icons/generic-app-icon.tsx",
    category: "Integrations",
    variants: ["mark-mono", "mark-light", "mark-dark", "app-dark", "app-light"],
    logoSource: null,
    logoNotes: null,
    logoRaster: false,
  },
] as const;

export type IntegrationIconName =
  (typeof integrationIconCatalog)[number]["name"];

export const integrationIconNameByIntegration: Readonly<
  Record<string, IntegrationIconName | undefined>
> = Object.fromEntries(
  integrationIconCatalog.flatMap((icon) =>
    icon.integrationNames.map((name) => [name, icon.name]),
  ),
);
