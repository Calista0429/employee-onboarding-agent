// Adapted from Money Forward cloud-react-ui (MIT). See LICENSE.txt and THIRD_PARTY_NOTICES.md.
import { forwardRef, type HTMLAttributes, type InputHTMLAttributes } from 'react';
import './mf.css';

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(
  ({ type = 'text', error = false, className = '', ...rest }, ref) => (
    <input type={type} ref={ref} className={`mf-input ${error ? 'mf-input-error' : ''} ${className}`} aria-invalid={error || undefined} {...rest} />
  ),
);
TextField.displayName = 'TextField';

export const Block = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { border?: boolean }>(
  ({ border = false, className = '', ...rest }, ref) => <div ref={ref} className={`mf-block ${border ? 'mf-block-border' : ''} ${className}`} {...rest} />,
);
Block.displayName = 'Block';

export const StatusLabel = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement> & {
  color: 'gray' | 'red' | 'green' | 'orange' | 'blue'; bold?: boolean; outline?: boolean;
}>(({ color, bold = false, outline = false, className = '', ...rest }, ref) => (
  <span ref={ref} className={`mf-status mf-status-${color} ${bold ? 'mf-status-bold' : ''} ${outline ? 'mf-status-outline' : ''} ${className}`} {...rest} />
));
StatusLabel.displayName = 'StatusLabel';
