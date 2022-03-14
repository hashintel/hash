import { Button } from "@mui/material";
import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import { Fragment } from "react";

const variants = ["primary", "secondary", "tertiary"] as const;
const sizes = ["large", "medium"] as const;
const contents = [<>Join</>, <>Download</>] as const;

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>Hello World</title>
      </Head>
      <Image src="/logo.svg" width={176} height={18.38} />
      <h1>Hello World</h1>
      <div style={{ margin: 40 }}>
        {variants.map((variant) => (
          <Fragment key={variant}>
            {sizes.map((size, idx) => (
              <div key={size}>
                <h3>
                  {variant} {size}
                </h3>
                <div style={{ display: "flex" }}>
                  <Button size={size} variant={variant}>
                    {contents[idx]}
                  </Button>
                  <div style={{ width: 30 }} />
                  <Button size={size} variant={variant} disabled>
                    {contents[idx]}
                  </Button>
                </div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </>
  );
};

export default Home;
