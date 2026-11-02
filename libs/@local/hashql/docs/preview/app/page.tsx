import { redirect } from "next/navigation.js";

export default function Home(): never {
  redirect("/docs/hashql");
}
