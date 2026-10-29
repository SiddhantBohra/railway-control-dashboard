'use client';

import { Square, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export function StopDialog({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Square aria-hidden="true" className="size-3 fill-current" /> Stop workload
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <div className="dialog-symbol">
          <Trash2 aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <AlertDialogTitle>Stop and remove deployment?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the current deployment and discards its ephemeral container data. The
            service and its configuration remain. Starting again creates a new deployment.
          </AlertDialogDescription>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel>Keep running</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Stop and remove deployment</AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
