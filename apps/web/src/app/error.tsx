'use client';

import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel empty-state">
      <h1>The view was interrupted</h1>
      <p>Accepted operations continue in the API. Reload the view to see their current status.</p>
      <Button onClick={reset}>Reload view</Button>
    </section>
  );
}
