import { useState } from "react";

import { petriconStudies, PetriconProvider } from "@hashintel/petrinaut/ui";

import { GlyphDemo } from "./glyph-demo";

export const Studies = () => {
  const [category, setCategory] = useState("Modeling");
  const [draw, setDraw] = useState(false);
  return (
    <PetriconProvider enabled>
      <div className="petricon-study-tabs" aria-label="Study categories">
        {["Modeling", "Math", "Code", "AI"].map((option) => (
          <button
            type="button"
            aria-pressed={category === option}
            key={option}
            onClick={() => setCategory(option)}
          >
            {option}
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      {category === "Modeling" && (
        <div className="petricon-study-motion" aria-label="Study motion">
          <span>Click a symbol to compare</span>
          <button
            type="button"
            aria-pressed={!draw}
            onClick={() => setDraw(false)}
          >
            Action
          </button>
          <button
            type="button"
            aria-pressed={draw}
            onClick={() => setDraw(true)}
          >
            Draw on
          </button>
        </div>
      )}
      <div className="petricon-studies-grid">
        {petriconStudies
          .filter((study) => study.category === category)
          .map((study, index) => (
            <article className="petricon-study" key={study.concept}>
              <div className="petricon-study-heading">
                <h3>{study.concept}</h3>
                <span className="petricon-kicker">0{index + 1}</span>
              </div>
              <div className="petricon-study-pair">
                {study.names.map((name, variant) => (
                  <div key={name}>
                    <span className="petricon-kicker">
                      {String.fromCharCode(65 + variant)}
                    </span>
                    <GlyphDemo
                      name={name}
                      label={study.variants[variant] ?? name}
                      size={40}
                      effect={
                        category === "Modeling" && draw ? "draw" : "action"
                      }
                    />
                  </div>
                ))}
              </div>
              <p>{study.motion}</p>
            </article>
          ))}
      </div>
      <p className="petricon-studies-note">
        Multiple directions per concept. Hover for a hint; click for its action.
        Modeling studies also draw on, stroke by stroke. Find each variation in
        the collection above.
      </p>
    </PetriconProvider>
  );
};
