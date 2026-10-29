import type { ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';

export function Message({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'error' | 'warning';
}) {
  const Icon = tone === 'error' ? CircleAlert : tone === 'warning' ? TriangleAlert : Info;
  return (
    <div className={`message message-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" className="message-icon" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
