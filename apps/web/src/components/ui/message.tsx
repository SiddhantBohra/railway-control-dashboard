import type { ReactNode } from 'react';

export function Message({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'error' | 'warning';
}) {
  return (
    <div className={`message message-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
