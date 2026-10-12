import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '../common/Button';
import { Skeleton } from '../common/Skeleton';
import { useAccount } from '../../hooks/useAccount';

/** Prevents a restored account from briefly rendering guest authentication pages. */
export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { profile, loading, error, refresh } = useAccount();

  if (loading) return <main className="p-8"><Skeleton kind="profile" label="Restoring your account" /></main>;
  if (profile) return <Navigate to="/dashboard" replace />;
  if (error) return <main className="mx-auto max-w-xl p-8" role="alert"><p>{error}</p><Button className="mt-4" onClick={() => void refresh()}>Retry session restoration</Button></main>;
  return children;
}
