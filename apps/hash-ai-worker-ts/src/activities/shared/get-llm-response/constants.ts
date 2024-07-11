/**
 * The maximum number of times to retry a request to the LLM API.
 */
export const maxRetryCount = 5;

/**
 * The starting delay when a rate limit error is encountered.
 */
export const defaultRateLimitRetryDelay = 10_000;

/**
 * The maximum number of times a request is retried when a rate limit error is encountered.
 */
export const maximumRateLimitRetries = 10;

/**
 * The maximum number of times a request is retried with an exponential backoff, when encountering a server error.
 */
export const maximumExponentialBackoffRetries = 10;

/**
 * The default delay between retries when an LLM server error is encountered (e.g. because of throttling).
 */
export const serverErrorRetryStartingDelay = 5_000;

[
  {
    name: "Sundar Pichai",
    summary:
      "Sundar Pichai is the Chief Executive Officer (CEO) of Alphabet Inc. and its subsidiary Google LLC. He has held these roles since December 2019.",
  },
  {
    name: "Anat Ashkenazi",
    summary:
      "Anat Ashkenazi is the Chief Financial Officer (CFO) of Alphabet Inc.",
  },
  {
    name: "Larry Page",
    summary:
      "Larry Page is a co-founder of Google and served as the Chief Executive Officer (CEO) of Alphabet Inc. from 2015 to 2018. He currently remains an employee, board member, and controlling shareholder of Alphabet.",
  },
  {
    name: "Sergey Brin",
    summary:
      "Sergey Brin is a co-founder of Google and served as the President of Alphabet Inc. from 2015 to 2018. He currently remains an employee, board member, and controlling shareholder of Alphabet.",
  },
  {
    name: "John L. Hennessy",
    summary:
      "John L. Hennessy is the Chairman of the Board of Directors of Alphabet Inc. since February 2018.",
  },
  {
    name: "Astro Teller",
    summary:
      'Astro Teller is the Head of X Development, Alphabet\'s research and development division for "moonshot" technologies.',
  },
  {
    name: "Wendy Tan White",
    summary:
      "Wendy Tan White is the CEO of Intrinsic, Alphabet's robotics software company.",
  },
  {
    name: "Demis Hassabis",
    summary:
      "Demis Hassabis is the CEO of Isomorphic Labs, Alphabet's artificial intelligence company focused on drug discovery.",
  },
  {
    name: "Dmitri Dolgov",
    summary:
      "Dmitri Dolgov is the Co-CEO of Waymo, Alphabet's autonomous driving technology company.",
  },
  {
    name: "Tekedra Mawakana",
    summary:
      "Tekedra Mawakana is the Co-CEO of Waymo, Alphabet's autonomous driving technology company.",
  },
];
