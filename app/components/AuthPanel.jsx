'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

export default function AuthPanel({ onUserChange }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('');

  async function loadProfile(currentUser) {
    if (!currentUser) {
      setProfile(null);
      onUserChange?.(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id,email,name,role')
      .eq('id', currentUser.id)
      .single();

    if (error) {
      setStatus(error.message);
      return;
    }

    setProfile(data);
    onUserChange?.({ ...currentUser, profile: data });
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user || null);
      loadProfile(data.user || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      loadProfile(currentUser);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(event) {
    event.preventDefault();
    setStatus('Anmeldung läuft ...');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setStatus(error ? error.message : 'Erfolgreich angemeldet.');
  }

  async function signUp() {
    setStatus('Registrierung läuft ...');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    setStatus(error ? error.message : 'Registrierung erfolgreich. Prüfe ggf. deine E-Mails zur Bestätigung.');
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setStatus('Abgemeldet.');
  }

  if (user) {
    return (
      <section>
        <h2>Mein Konto</h2>
        <p><strong>{profile?.name || user.email}</strong></p>
        <p>Rolle: {profile?.role || 'wird geladen ...'}</p>
        <button type="button" onClick={signOut}>Abmelden</button>
        {status && <p role="status">{status}</p>}
      </section>
    );
  }

  return (
    <section>
      <h2>Anmelden</h2>
      <form onSubmit={signIn} style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (für Registrierung)" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passwort" required minLength={6} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit">Anmelden</button>
          <button type="button" onClick={signUp}>Registrieren</button>
        </div>
      </form>
      <p>Neue Konten erhalten zunächst die Rolle Schüler.</p>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
