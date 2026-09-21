import { PetriconProvider, petriconCatalog } from "@hashintel/petrinaut/ui";

import { GlyphDemo } from "./petricon-page/glyph-demo";
import { Playground } from "./petricon-page/playground";
import { Studies } from "./petricon-page/studies";
import "./petricon-page/petricon.css";

export const PetriconPage = () => (
  <div className="petrinaut-root petricon-page">
    <title>Petricon — Icons with intent</title>
    <meta
      name="description"
      content="Petricon is Petrinaut’s collection of original, animated SVG icons. Explore variable weight, responsive motion, and new studies in math, code, and AI."
    />
    <a href="#collection" className="petricon-skip">
      Skip to icons
    </a>
    <div className="petricon-sheet">
      <header className="petricon-nav">
        <a href="/" className="petricon-home">
          <span className="petricon-mark" aria-hidden="true" />
          PETRINAUT<span className="petricon-nav-slash">/</span>PETRICON
        </a>
        <nav aria-label="Petricon">
          <a href="#collection">Collection</a>
          <a href="#studies">Studies</a>
          <a href="#usage">
            Use it <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>
      <main>
        <section className="petricon-hero" aria-labelledby="petricon-title">
          <div className="petricon-hero-top">
            <span className="petricon-kicker">
              A SYMBOL LIBRARY BY PETRINAUT
            </span>
            <span className="petricon-kicker">
              SVG / VARIABLE WEIGHT / MOTION
            </span>
          </div>
          <h1 id="petricon-title">
            Petricon<span>.</span>
          </h1>
          <div className="petricon-hero-bottom">
            <h2>
              Small forms.
              <br />
              Clear intent.
            </h2>
            <div>
              <p>
                Icons drawn to belong together.
                <br />
                Motion that tells you what comes next.
              </p>
              <a className="petricon-cta" href="#collection">
                Play with the collection <span aria-hidden="true">↓</span>
              </a>
            </div>
            <span className="petricon-edition">
              {petriconCatalog.length}
              <small>ORIGINAL SYMBOLS</small>
            </span>
          </div>
        </section>
        <PetriconProvider enabled weight={350}>
          <div className="petricon-hero-demos" aria-label="Try Petricon">
            <GlyphDemo name="shapes" label="Arrange" />
            <GlyphDemo name="flask" label="Experiment" />
            <GlyphDemo name="diagnostics" label="Resolve" />
            <GlyphDemo name="agent" label="Assist" />
          </div>
        </PetriconProvider>
        <div className="petricon-principles">
          <p>
            <span>01 / FORM</span>One grid. A continuous range of weights.
          </p>
          <p>
            <span>02 / MOTION</span>A hint on hover. A response on press.
          </p>
          <p>
            <span>03 / STATE</span>The same parts, finding a new position.
          </p>
        </div>
        <section
          id="collection"
          className="petricon-section"
          aria-labelledby="collection-title"
        >
          <div className="petricon-section-heading">
            <div>
              <span className="petricon-kicker">01 — THE COLLECTION</span>
              <h2 id="collection-title">
                Make yourself
                <br />
                understood.
              </h2>
            </div>
            <p>
              Find a symbol. Tune its weight.
              <br />
              Try its motion and change its state.
            </p>
          </div>
          <Playground />
        </section>
        <section
          id="studies"
          className="petricon-section petricon-studies-section"
          aria-labelledby="studies-title"
        >
          <div className="petricon-section-heading">
            <div>
              <span className="petricon-kicker">02 — NEW STUDIES</span>
              <h2 id="studies-title">
                More ways
                <br />
                to express it.
              </h2>
            </div>
            <p>
              Models, math, code, and artificial intelligence.
              <br />
              Multiple directions. Each with its own motion.
            </p>
          </div>
          <Studies />
        </section>
        <section
          id="usage"
          className="petricon-section petricon-usage"
          aria-labelledby="usage-title"
        >
          <div>
            <span className="petricon-kicker">03 — IN YOUR INTERFACE</span>
            <h2 id="usage-title">
              A little code.
              <br />A lot of character.
            </h2>
            <p>
              Use a name, pass a state, choose a weight.
              <br />
              Petricon handles the motion.
            </p>
            <p className="petricon-usage-note">
              Available in <code>@hashintel/petrinaut/ui</code>.<br />
              Respects reduced motion. Keyboard friendly.
            </p>
            <a href="/" className="petricon-text-link">
              Open Petrinaut <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div>
            <span className="petricon-kicker">REACT / TYPESCRIPT</span>
            <pre className="petricon-usage-code">
              <code>{`import { Petricon, PetriconProvider }\n  from "@hashintel/petrinaut/ui";\nimport "@hashintel/petrinaut/styles.css";\n\n<PetriconProvider weight={400}>\n  <button aria-label="Settings">\n    <Petricon\n      name="settings"\n      open={isOpen}\n      size={24}\n      duration={240}\n    />\n  </button>\n</PetriconProvider>`}</code>
            </pre>
          </div>
        </section>
      </main>
      <footer className="petricon-footer">
        <span>
          PETRICON <span aria-hidden="true">↗</span>
          <small>Made for Petrinaut.</small>
        </span>
        <p>
          Original drawings. Shared principles.
          <br />
          <a href="https://developer.apple.com/sf-symbols/">SF Symbols</a> ·{" "}
          <a href="https://lucide.dev/">Lucide</a> ·{" "}
          <a href="https://www.stixfonts.org/">STIX</a>
        </p>
        <a href="#petricon-title">Back to top ↑</a>
      </footer>
    </div>
  </div>
);
