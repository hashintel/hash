import Link from "next/link";

export default function Home() {
  return (
    <div>
      <div>Hello, world!</div>
      <br /><br />
      <Link href="/playground">
        <a>Click here to visit the block playground</a>
      </Link>
    </div>
  );
}
