import { useEffect } from "react";

const linkAttribute = "data-petrinaut-stylesheet";

let users = 0;

/**
 * Adds Petrinaut's stylesheet to the document while a component using this
 * hook is mounted. The app's Panda output shadows the stylesheet's atomic
 * utilities (see `panda.config.ts`); the stylesheet supplies the rest: vendor
 * CSS, fonts, and the `.petrinaut-root`-scoped preflight, tokens and globals.
 *
 * Outside `_app`, the Pages Router accepts global CSS only from
 * `node_modules`, and `@hashintel/petrinaut` resolves to its workspace
 * directory, so the stylesheet is linked at runtime instead of imported.
 * Keeping it off `_app` keeps its `data:` fonts off routes whose policy
 * allows `font-src 'self'` only.
 */
export const usePetrinautStylesheet = () => {
  useEffect(() => {
    users += 1;

    if (!document.head.querySelector(`link[${linkAttribute}]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL(
        "@hashintel/petrinaut/dist/main.css",
        import.meta.url,
      ).href;
      link.setAttribute(linkAttribute, "");
      document.head.appendChild(link);
    }

    return () => {
      users -= 1;
      if (users === 0) {
        document.head.querySelector(`link[${linkAttribute}]`)?.remove();
      }
    };
  }, []);
};
