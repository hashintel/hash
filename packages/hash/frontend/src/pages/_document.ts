import withTwindDocument from "@twind/next/document";
import Document, { DocumentContext } from "next/document";

class MyDocument extends Document {
  static async getInitialProps(context: DocumentContext) {
    const initialProps = await Document.getInitialProps(context);
    return { ...initialProps };
  }
}

export default withTwindDocument(MyDocument);
