'use client';

import { FormEvent, useState } from 'react';
import { ArrowRight, AudioLines, CircleAlert, LockKeyhole } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const requestedPath = new URLSearchParams(window.location.search).get('next');
      const nextPath = requestedPath?.startsWith('/dashboard') ? requestedPath : '/dashboard';
      window.location.assign(nextPath);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed.');
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-symbol"><AudioLines size={21} strokeWidth={2.2} /></span>
          <span>RESTAURANT ADMIN</span>
        </div>
        <div className="story-copy">
          <p className="eyebrow">OPERATIONS / 01</p>
          <h1>Every service,<br />in good order.</h1>
          <p>A clear view of every order, reservation, and call.</p>
        </div>
        <div className="story-footer"><span className="live-dot" /> Voice assistant dashboard</div>
        <div className="story-index">RESTAURANT OPERATIONS</div>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="mobile-login-brand"><span className="brand-symbol"><AudioLines size={20} /></span> RESTAURANT ADMIN</div>
          <div className="login-heading">
            <span className="login-icon"><LockKeyhole size={19} /></span>
            <p className="eyebrow">ADMINISTRATOR ACCESS</p>
            <h2>Welcome back</h2>
            <p>Sign in to view daily operations.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />

            <div className="password-label"><label htmlFor="password">Password</label></div>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" />

            {error && <div className="form-error" role="alert"><CircleAlert size={16} /> {error}</div>}
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} />
            </button>
          </form>

          <p className="login-footnote">Access is limited to provisioned administrator accounts.</p>
        </div>
        <div className="login-bottom">SECURE ACCESS <span>SUPABASE AUTH</span></div>
      </section>
    </main>
  );
}