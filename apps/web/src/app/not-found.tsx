import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <section className="panel empty-state">
      <h1>Nothing here</h1>
      <Button variant="outline" asChild>
        <Link href="/">Back to the control room</Link>
      </Button>
    </section>
  );
}
