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
  const [art, setArt] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  function melde(text, artDerMeldung = '') {
    setStatus(text);
    setArt(artDerMeldung);
  }

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
      melde(error.message, 'fehler');
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

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        melde('Bitte lege ein neues Passwort fest.');
      }

      const currentUser = session?.user || null;
      setUser(currentUser);
      loadProfile(currentUser);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(event) {
    event.preventDefault();
    melde('Anmeldung läuft …');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    melde(error ? error.message : 'Angemeldet.', error ? 'fehler' : 'ok');
  }

  async function signUp() {
    if (!email || password.length < 6) {
      melde('Bitte E-Mail eingeben und ein Passwort mit mindestens sechs Zeichen wählen.', 'fehler');
      return;
    }
    melde('Registrierung läuft …');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    melde(
      error ? error.message : 'Registriert. Schau in dein Postfach — dort liegt die Bestätigung.',
      error ? 'fehler' : 'ok',
    );
  }

  async function requestPasswordReset() {
    if (!email) {
      melde('Bitte zuerst deine E-Mail-Adresse eingeben.', 'fehler');
      return;
    }

    melde('Link wird versendet …');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    melde(
      error ? error.message : 'Wenn das Konto existiert, ist ein Link zum Zurücksetzen unterwegs.',
      error ? 'fehler' : 'ok',
    );
  }

  async function updatePassword(event) {
    event.preventDefault();

    if (newPassword.length < 6) {
      melde('Das neue Passwort muss mindestens sechs Zeichen lang sein.', 'fehler');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    setNewPassword('');
    setRecoveryMode(false);
    melde('Passwort geändert.', 'ok');
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    melde('Abgemeldet.');
  }

  // ---------- Neues Passwort setzen ----------
  if (recoveryMode) {
    return (
      <section className="abschnitt">
        <div className="karte karte--gelb" style={{ maxWidth: 460 }}>
          <span className="ol">Konto</span>
          <h2>Neues Passwort</h2>
          <form onSubmit={updatePassword} style={{ marginTop: 18 }}>
            <div className="feld">
              <label htmlFor="auth-neu">
                Neues Passwort <span className="pflicht" aria-hidden="true">*</span>
              </label>
              <input
                id="auth-neu"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mindestens sechs Zeichen"
                minLength={6}
                required
              />
            </div>
            <button type="submit" className="taste taste--gelb">Passwort speichern</button>
          </form>
          <p className={`meldung${art ? ` meldung--${art}` : ''}`} role="status" aria-live="polite">
            {status}
          </p>
        </div>
      </section>
    );
  }

  // ---------- Angemeldet ----------
  if (user) {
    return (
      <section className="abschnitt">
        <div
          className="karte"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
        >
          <div>
            <span className="kennzahl__titel">Angemeldet als</span>
            <p style={{ color: 'var(--weiss)', fontWeight: 700, fontSize: 18, margin: '4px 0 2px' }}>
              {profile?.name || user.email}
            </p>
            <span className={`marke ${profile?.role === 'Admin' ? 'marke--frei' : 'marke--offen'}`}>
              {profile?.role || 'Rolle wird geladen …'}
            </span>
          </div>
          <button type="button" className="taste taste--klar" onClick={signOut}>
            Abmelden
          </button>
        </div>
        {status && (
          <p className={`meldung${art ? ` meldung--${art}` : ''}`} role="status" aria-live="polite">
            {status}
          </p>
        )}
      </section>
    );
  }

  // ---------- Anmeldung ----------
  return (
    <section className="abschnitt">
      <div className="karte karte--gelb" style={{ maxWidth: 460 }}>
        <span className="ol">Zugang</span>
        <h2>Anmelden</h2>
        <p style={{ margin: '10px 0 20px', fontSize: 15 }}>
          Noch kein Konto? Trag dich mit denselben Feldern ein und wähle
          „Registrieren". Neue Konten starten als Schüler.
        </p>

        <form onSubmit={signIn}>
          <div className="feld">
            <label htmlFor="auth-name">
              Name <span className="freiwillig">(nur für die Registrierung)</span>
            </label>
            <input
              id="auth-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vor- und Nachname"
              autoComplete="name"
            />
          </div>

          <div className="feld">
            <label htmlFor="auth-mail">
              E-Mail <span className="pflicht" aria-hidden="true">*</span>
            </label>
            <input
              id="auth-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@beispiel.de"
              autoComplete="email"
              required
            />
          </div>

          <div className="feld">
            <label htmlFor="auth-pw">
              Passwort <span className="pflicht" aria-hidden="true">*</span>
            </label>
            <input
              id="auth-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mindestens sechs Zeichen"
              autoComplete="current-password"
              minLength={6}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" className="taste taste--gelb">Anmelden</button>
            <button type="button" className="taste taste--klar" onClick={signUp}>Registrieren</button>
            <button
              type="button"
              onClick={requestPasswordReset}
              style={{
                background: 'none', border: 'none', color: 'var(--weiss-50)',
                cursor: 'pointer', fontSize: 13.5, textDecoration: 'underline',
                textUnderlineOffset: 3, minHeight: 48, padding: '0 4px',
                fontFamily: 'var(--disp)',
              }}
            >
              Passwort vergessen
            </button>
          </div>
        </form>

        <p className={`meldung${art ? ` meldung--${art}` : ''}`} role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </section>
  );
}
