'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SessionSchema } from '@control/contracts';
import type { Session } from '@control/contracts';
import { http, errorMessage } from '@/lib/http';
import { useSession } from './session';
import { Button } from '@/components/ui/button';
import { Message } from '@/components/ui/message';
import { ResourceDashboard } from '@/features/resources/resource-dashboard';

function Login({ session }: { session: Session }) {
  const client = useQueryClient();
  const login = useMutation({
    gcTime: 0,
    mutationFn: (credentials: { username: string; password: string }) =>
      http('/auth/login', SessionSchema, {
        method: 'POST',
        body: credentials,
        csrfToken: session.csrfToken,
      }),
    onSuccess: (result) => {
      client.setQueryData(['session'], result);
    },
  });
  return (
    <div className="login-grid">
      <div className="login-intro">
        <span className="eyebrow">A SMALL CONTROL ROOM</span>
        <h1>
          Your workload.
          <br />
          <span className="text-muted">A little more clarity.</span>
        </h1>
        <p>Start a container, stop a deployment, and know exactly where every request stands.</p>
        <div className="login-principle">
          <span className="principle-line" />
          <span>Requested. Observed. Confirmed.</span>
        </div>
      </div>
      <section className="panel login-panel" aria-labelledby="login-heading">
        <div className="panel-heading">
          <div className="small-icon" aria-hidden="true">
            ↳
          </div>
          <h2 id="login-heading">Enter the control room</h2>
          <p>Sign in with your demo credentials.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const username = form.get('username');
            const password = form.get('password');
            if (typeof username === 'string' && typeof password === 'string')
              login.mutate({ username, password });
          }}
        >
          <label htmlFor="username">Username</label>
          <input id="username" name="username" autoComplete="username" required maxLength={100} />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
          {login.isError && <Message tone="error">{errorMessage(login.error)}</Message>}
          <Button type="submit" disabled={login.isPending} className="w-full">
            {login.isPending ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">→</span>
          </Button>
        </form>
        <p className="login-footnote">One authorized user. One managed workload.</p>
      </section>
    </div>
  );
}

export function SessionGate() {
  const session = useSession();
  if (session.isPending)
    return (
      <div className="panel empty-state" role="status">
        Opening your control room…
      </div>
    );
  if (session.isError)
    return (
      <div className="panel empty-state">
        <h1>Control room unavailable</h1>
        <Message tone="error">{errorMessage(session.error)}</Message>
        <Button
          variant="secondary"
          onClick={() => {
            void session.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  if (!session.data.authenticated) return <Login session={session.data} />;
  return <ResourceDashboard session={session.data} />;
}
