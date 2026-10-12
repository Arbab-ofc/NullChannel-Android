import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' };
export const Button = ({ className = '', variant, type = 'button', ...props }: Props) => (
  <button
    type={type}
    className={`nc-button nc-button--${variant ?? (/\bbg-accent\b/.test(className) ? 'primary' : /(?:border|text)-(?:punch|red)/.test(className) ? 'danger' : 'secondary')} ${className}`}
    {...props}
  />
);
