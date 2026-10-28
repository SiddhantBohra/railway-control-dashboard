import type { ButtonHTMLAttributes } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
}) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}
