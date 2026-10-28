import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="panel empty-state">
      <h1>Nothing here</h1>
      <Link className="button button-secondary" href="/">
        Back to the control room
      </Link>
    </section>
  );
}
