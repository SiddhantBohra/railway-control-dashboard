'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from '@/components/ui/button';

export function StopDialog({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button variant="secondary" disabled={disabled}>
          <span aria-hidden="true">■</span> Stop workload
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <span className="eyebrow">DEPLOYMENT REMOVAL</span>
          <AlertDialog.Title>Stop and remove deployment?</AlertDialog.Title>
          <AlertDialog.Description>
            This removes the current deployment and discards its ephemeral container data. The
            service and its configuration remain. Starting again creates a new deployment.
          </AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Keep running</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                Stop and remove deployment
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
