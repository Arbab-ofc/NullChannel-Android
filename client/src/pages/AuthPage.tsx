import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { accountApi, accountError } from '../lib/account';
import { useAccount } from '../hooks/useAccount';
import { Button } from '../components/common/Button';
import { ThemeToggle } from '../components/common/ThemeToggle';
export function safeNext(next: string | null) { return next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/dashboard'; }
export default function AuthPage({mode}: {mode: 'login' | 'signup' | 'forgot-password' | 'reset-password'}) {
  const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const {refresh} = useAccount(); const nav = useNavigate(); const [search] = useSearchParams();
  const titles = {'login':'Welcome back','signup':'Keep your friends. Lose the history.','forgot-password':'Reset your password','reset-password':'Choose a new password'};
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget); const password = String(fields.get('password') ?? '');
    setError(''); setNotice('');
    if ((mode === 'signup' || mode === 'reset-password') && password !== fields.get('confirm')) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') { await accountApi.post('/account/login',{email: fields.get('email'),password}); await refresh(); localStorage.setItem('nullchannel_account_event',`login:${Date.now()}`); nav(safeNext(search.get('next')), {replace:true}); }
      if (mode === 'signup') { const res = await accountApi.post('/account/signup',{username:fields.get('username'),email:fields.get('email'),password}); if (res.data.data?.profile) { await refresh(); nav('/dashboard'); } else setNotice('Check your email to verify your account, then sign in.'); }
      if (mode === 'forgot-password') { await accountApi.post('/account/forgot-password',{email:fields.get('email')}); setNotice('If this email can receive a reset link, instructions will arrive shortly.'); }
      if (mode === 'reset-password') { const hash = new URLSearchParams(window.location.hash.slice(1)); const accessToken = hash.get('access_token'); const refreshToken = hash.get('refresh_token'); if (!accessToken || !refreshToken) throw new Error('invalid-reset'); await accountApi.post('/account/reset-password',{password,accessToken,refreshToken}); history.replaceState(null,'','/reset-password'); setNotice('Password updated. You can sign in now.'); }
    } catch (e) { setError(e instanceof Error && e.message === 'invalid-reset' ? 'This reset link is invalid or expired. Request a new link.' : accountError(e)); } finally { setBusy(false); }
  }
  return <main className="mx-auto min-h-[80dvh] max-w-lg px-4 py-8"><header className="mb-10 flex items-center justify-between"><Link to="/" className="code-font text-xl font-bold">NullChannel</Link><ThemeToggle /></header><section className="neo-panel p-5 sm:p-8"><p className="code-font text-xs uppercase tracking-widest text-cyan">Accounts persist. Conversations disappear.</p><h1 className="my-4 text-3xl font-bold">{titles[mode]}</h1><form onSubmit={e => void submit(e)} className="space-y-4">
    {mode === 'signup' && <Field label="Username" name="username" autoComplete="username" pattern="[A-Za-z0-9_]{3,24}" minLength={3} maxLength={24} hint="3–24 letters, numbers or underscores." />}
    {(mode === 'signup' || mode === 'login' || mode === 'forgot-password') && <Field label="Email" name="email" type="email" autoComplete="email" />}
    {mode !== 'forgot-password' && <Field label="Password" name="password" type="password" maxLength={128} minLength={mode === 'login' ? 1 : 12} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} hint={mode === 'login' ? undefined : 'Use at least 12 characters.'} />}
    {(mode === 'signup' || mode === 'reset-password') && <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" />}
    {error && <p role="alert" className="text-sm text-punch">{error}</p>}{notice && <p role="status" className="text-sm text-cyan">{notice}</p>}<Button disabled={busy} className="min-h-12 w-full" type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Login' : mode === 'signup' ? 'Create account' : 'Reset password'}</Button>
  </form><div className="mt-6 flex flex-wrap gap-4 text-sm text-cyan"><Link to={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Link><Link to="/forgot-password">Forgot password?</Link><Link to="/">Continue anonymously</Link></div></section></main>;
}
export function Field({label,hint,required=true,...props}: React.InputHTMLAttributes<HTMLInputElement> & {label:string; hint?:string}) { return <label className="block text-sm font-semibold">{label}<input {...props} required={required} className="mt-2 block min-h-12 w-full border-2 border-accent/40 bg-bg px-3 py-2 text-text outline-none focus:border-cyan" />{hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}</label>; }
