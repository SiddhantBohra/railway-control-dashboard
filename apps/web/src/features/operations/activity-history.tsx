import type { Operation } from '@control/contracts';
import { Status } from '@/components/ui/status';
import { Button } from '@/components/ui/button';

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
    <section className="panel history-panel" aria-labelledby="history-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE PAPER TRAIL</span>
          <h2 id="history-heading">Activity</h2>
        </div>
        <span className="subtle">Newest first</span>
      </div>
      {operations.length === 0 ? (
        <div className="empty-history">
          <span aria-hidden="true">↳</span>
          <p>No requests yet.</p>
          <span className="subtle">Your first start or stop will appear here.</span>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Status</th>
                <th scope="col">Requested</th>
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((operation) => (
                <tr key={operation.id}>
                  <td>
                    <span className="action-symbol" aria-hidden="true">
                      {operation.action === 'start' ? '↗' : '↙'}
                    </span>
                    {operation.action === 'start' ? 'Start workload' : 'Stop deployment'}
                  </td>
                  <td>
                    <Status state={operation.state} />
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
                    <code title={operation.id}>{operation.id.slice(0, 8)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <div className="history-footer">
          <Button variant="quiet" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? 'Loading…' : 'Load earlier requests'}
          </Button>
        </div>
      )}
    </section>
  );
}
