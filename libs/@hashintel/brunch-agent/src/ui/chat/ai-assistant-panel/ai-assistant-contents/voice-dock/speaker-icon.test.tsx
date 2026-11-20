import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { SpeakerIcon } from "./speaker-icon";

it("adds a slash without changing the speaker when muted", () => {
  const audible = renderToStaticMarkup(<SpeakerIcon />);
  const muted = renderToStaticMarkup(<SpeakerIcon muted />);

  expect(audible).toContain('aria-hidden="true"');
  expect(audible).not.toContain('d="M4 4l16 16"');
  expect(muted).toBe(
    audible.replace(
      "</svg>",
      '<path d="M4 4l16 16" stroke="currentColor" stroke-width="1.75"></path></svg>',
    ),
  );
});
