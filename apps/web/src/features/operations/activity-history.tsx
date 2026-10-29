import { ArrowDownLeft, ArrowUpRight, ChevronDown, History, ListFilter } from 'lucide-react';
import type { Operation } from '@control/contracts';
import { Status } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

export function ActivityHistory({
  operations,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  operations: Operation[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <Card role="region" className="history-panel" aria-labelledby="history-heading">
      <div className="section-heading">
        <div className="history-title">
          <History aria-hidden="true" />
          <h2 id="history-heading">Activity</h2>
          <Badge variant="secondary">{operations.length} shown</Badge>
        </div>
        <span className="history-sort">
          <ListFilter aria-hidden="true" /> Newest first
        </span>
      </div>
      {operations.length === 0 ? (
        <div className="empty-history">
          <div className="empty-history-icon">
            <History aria-hidden="true" />
          </div>
          <h3>No requests yet.</h3>
          <p>Your first start or stop will appear here.</p>
          <span className="subtle">A durable history of every action, from request to result.</span>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Status</th>
                <th scope="col">Duration</th>
                <th scope="col">Requested</th>
                <th scope="col">Request ID</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((operation) => (
                <tr key={operation.id}>
                  <td>
                    <div className="history-action">
                      <span
                        className={`action-symbol action-${operation.action}`}
                        aria-hidden="true"
                      >
                        {operation.action === 'start' ? <ArrowUpRight /> : <ArrowDownLeft />}
                      </span>
                      <span>
                        {operation.action === 'start' ? 'Start workload' : 'Stop deployment'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <Status state={operation.state} />
                  </td>
                  <td className="history-duration">
                    {operation.completedAt
                      ? `${Math.max(0, Math.floor((Date.parse(operation.completedAt) - Date.parse(operation.acceptedAt)) / 1000))}s`
                      : operation.state === 'review_required'
                        ? 'Awaiting review'
                        : 'In progress'}
                  </td>
                  <td>
                    <time dateTime={operation.acceptedAt}>
                      {new Date(operation.acceptedAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </time>
                  </td>
                  <td>
                    <code className="reference-chip" title={operation.id}>
                      {operation.id.slice(0, 8)}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <div className="history-footer">
          <Button
            variant="ghost"
            size="sm"
            disabled={loadingMore}
            aria-busy={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? <Spinner /> : <ChevronDown aria-hidden="true" />}
            {loadingMore ? 'Loading…' : 'Load earlier requests'}
          </Button>
        </div>
      )}
    </Card>
  );
}
