import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StopDialog } from './stop-dialog';

test('requires an explicit removal confirmation and restores focus on cancel', async () => {
  const confirm = jest.fn();
  const user = userEvent.setup();
  render(<StopDialog disabled={false} onConfirm={confirm} />);
  const trigger = screen.getByRole('button', { name: 'Stop workload' });
  await user.click(trigger);
  expect(screen.getByRole('alertdialog')).toBeVisible();
  expect(screen.getByText(/discards its ephemeral container data/)).toBeVisible();
  expect(confirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep running' }));
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Stop and remove deployment' }));
  expect(confirm).toHaveBeenCalledTimes(1);
});

test('conflicting actions cannot open the confirmation dialog', async () => {
  render(<StopDialog disabled onConfirm={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Stop workload' })).toBeDisabled();
});
