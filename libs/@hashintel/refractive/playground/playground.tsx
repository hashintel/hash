import { CONVEX } from "../src/helpers/surface-equations";
import { refractive } from "../src/hoc/refractive";
import { ExampleArticle } from "./example-article";

export const Playground = () => {
  return (
    <div style={{ position: "relative" }}>
      <refractive.div
        style={{
          position: "sticky",
          top: 100,
          marginLeft: "300px",
          width: 300,
          height: 200,
          backgroundColor: "rgba(255, 255, 255, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        refraction={{
          blur: 2,
          radius: 20,
          specularOpacity: 0.9,
          bezelWidth: 30,
          glassThickness: 70,
          refractiveIndex: 1.5,
          bezelHeightFn: CONVEX,
          specularAngle: 2,
        }}
      >
        Hello
      </refractive.div>

      <ExampleArticle />
    </div>
  );
};
