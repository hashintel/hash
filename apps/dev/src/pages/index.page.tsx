import { Button } from "@mui/material";
import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import { ComponentProps, Fragment, VFC } from "react";

type ButtonVariant = ComponentProps<typeof Button>["variant"];
type ButtonSize = ComponentProps<typeof Button>["size"];

const buttonVariants: ButtonVariant[] = ["primary", "secondary", "tertiary"];
const buttonSizes: ButtonSize[] = ["large", "medium"];
const contents = [<>Join</>, <>Download</>];

const ButtonSetup: VFC<{
  variant: ButtonVariant;
  sizes: ButtonSize[];
}> = ({ variant, sizes }) => (
  <>
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
  </>
);

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>Hello World</title>
      </Head>
      <Image src="/logo.svg" width={176} height={18.38} />
      <h1>Hello World</h1>
      <div style={{ margin: 40 }}>
        <ButtonSetup variant="primarySquare" sizes={["large"]} />
        {buttonVariants.map((variant) => (
          <ButtonSetup variant={variant} sizes={buttonSizes} key={variant} />
        ))}
      </div>
    </>
  );
};

export default Home;
