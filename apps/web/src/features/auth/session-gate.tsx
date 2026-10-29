'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Box, Check, CloudOff, LockKeyhole, Radio, ShieldCheck } from 'lucide-react';
import { SessionSchema } from '@control/contracts';
import type { Session } from '@control/contracts';
import { http, errorMessage } from '@/lib/http';
import { useSession } from './session';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Message } from '@/components/ui/message';
import { Spinner } from '@/components/ui/spinner';
import { DashboardSkeleton } from '@/components/loading-states';
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
        <span className="login-eyebrow">
          <Radio aria-hidden="true" /> YOUR INFRASTRUCTURE, IN VIEW
        </span>
        <h1>
          Your workload.
          <br />
          <span>A little more clarity.</span>
        </h1>
        <p>Start a container, stop a deployment, and know exactly where every request stands.</p>
        <div className="login-visual" aria-hidden="true">
          <div className="login-visual-top">
            <span className="flex items-center gap-2">
              <Box className="size-4" /> workload
            </span>
            <span className="visual-status">
              <span /> Running
            </span>
          </div>
          <div className="login-visual-flow">
            <span>
              <Check /> Requested
            </span>
            <i />
            <span>
              <Check /> Observed
            </span>
            <i />
            <span>
              <Check /> Confirmed
            </span>
          </div>
        </div>
        <div className="login-principle">
          <ShieldCheck aria-hidden="true" />
          <span>Every action tracked. Every outcome verified.</span>
        </div>
      </div>
      <Card role="region" className="login-panel" aria-labelledby="login-heading">
        <div className="panel-heading">
          <div className="small-icon" aria-hidden="true">
            <LockKeyhole />
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
          <Input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="Your username"
            required
            maxLength={100}
          />
          <label htmlFor="password">Password</label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            maxLength={256}
          />
          {login.isError && <Message tone="error">{errorMessage(login.error)}</Message>}
          <Button
            type="submit"
            disabled={login.isPending}
            aria-busy={login.isPending}
            className="mt-6 w-full"
            size="lg"
          >
            {login.isPending ? <Spinner /> : null}
            {login.isPending ? 'Signing in…' : 'Sign in'}{' '}
            {!login.isPending && <ArrowRight aria-hidden="true" />}
          </Button>
        </form>
        <p className="login-footnote">
          <ShieldCheck aria-hidden="true" /> Authenticated access to your workload.
        </p>
      </Card>
    </div>
  );
}

export function SessionGate() {
  const session = useSession();
  if (session.isPending) return <DashboardSkeleton label="Opening your control room…" />;
  if (session.isError)
    return (
      <div className="panel empty-state">
        <CloudOff aria-hidden="true" className="size-8 text-muted-foreground" />
        <h1>Control room unavailable</h1>
        <Message tone="error">{errorMessage(session.error)}</Message>
        <Button
          variant="outline"
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
