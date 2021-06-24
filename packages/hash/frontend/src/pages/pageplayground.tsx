import React, { VFC } from "react";
import { PageBlock } from "../blocks/page/PageBlock";
import contents from "../blocks/page/content.json";

const PagePlayground: VFC = () => <PageBlock contents={contents} />;

export default PagePlayground;
