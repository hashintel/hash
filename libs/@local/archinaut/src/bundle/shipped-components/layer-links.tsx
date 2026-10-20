/**
 * A titled card of links on generated layer pages: sub-layers, attached
 * guides, and further reading. Each entry is a link with an optional
 * one-line description.
 */

import "./layer-cards.css";

export interface LayerLinkEntry {
  label: string;
  href: string;
  description?: string;
  /** Render the label as code, for source paths. */
  code?: boolean;
}

export interface LayerLinksProps {
  title: string;
  entries: LayerLinkEntry[];
  /** One line under the title, for a caveat that applies to every entry. */
  note?: string;
}

export const LayerLinks = ({ title, entries, note }: LayerLinksProps) => (
  <section className="arch-card arch-links">
    <span className="arch-label">{title}</span>
    {note === undefined ? null : <p className="arch-links-note">{note}</p>}
    <dl className="arch-links-grid">
      {entries.map((entry) => (
        <div className="arch-links-row" key={entry.href}>
          <dt className="arch-links-term">
            <a href={entry.href}>
              {entry.code === true ? <code>{entry.label}</code> : entry.label}
            </a>
          </dt>
          <dd className="arch-links-description">{entry.description ?? ""}</dd>
        </div>
      ))}
    </dl>
  </section>
);
