type LoadingSignalProps = {
  label?: string;
  className?: string;
  variant?: 'inline'|'button'|'page';
};

export const LoadingSignal = ({ label = 'Loading', className = '', variant='inline' }: LoadingSignalProps) => (
  <span className={`loading-signal loading-signal--${variant} inline-flex items-center gap-2 ${className}`} aria-live="polite">
    <svg className="branded-loader" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="5" y="5" width="22" height="22" rx="7" stroke="currentColor" strokeOpacity=".2"/><path className="loader-orbit" d="M16 5h4a7 7 0 0 1 7 7v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M11 14h10m-10 4h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    <span>{label}</span>
  </span>
);
