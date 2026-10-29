import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cn('size-4 shrink-0 animate-spin motion-reduce:animate-none', className)}
    />
  );
}
