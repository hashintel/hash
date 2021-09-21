import withTwindDocument from "@twind/next/document";
import Document, { DocumentContext } from "next/document";

import twindConfig from "../../twind.config";

class MyDocument extends Document {
  static async getInitialProps(context: DocumentContext) {
    const initialProps = await Document.getInitialProps(context);
    return { ...initialProps };
  }
}

export default withTwindDocument(twindConfig, MyDocument);
