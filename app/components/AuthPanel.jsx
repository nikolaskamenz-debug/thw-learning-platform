'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

/**
 * Anmeldung, Registrierung, Passwort zuruecksetzen.
 *
 * Bestaetigt wird mit einem sechsstelligen Code, nicht mit einem Link.
 * Grund: Mailschutz wie Microsoft Safe Links oeffnet jeden eingehenden
 * Link vorab zur Pruefung. Supabase-Links funktionieren aber genau
 * einmal — der Scanner verbraucht den Token, und wenn der Mensch dann
 * klickt, ist er schon weg. Im Protokoll dieser Plattform ist genau das
 * nachweisbar: Der Link wurde 31 Sekunden nach dem Versand von einer
 * Microsoft-Adresse aufgerufen, nicht vom Empfaenger.
 *
 * Eine Zahl kann kein Scanner fuer jemanden abtippen.
 */

const MODUS = {
  anmelden: 'anmelden',
  codeRegistrierung: 'code_registrierung',
  codeZuruecksetzen: 'code_zuruecksetzen',
  neuesPasswort: 'neues_passwort',
};

export default function AuthPanel({ onUserChange }) {
  const [modus, setModus] = useState(MODUS.anmelden);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [neuesPasswort, setNeuesPasswort] = useState('');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('');
  const [art, setArt] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  function melde(text, artDerMeldung = '') {
    setStatus(text);
    setArt(artDerMeldung);
  }

  async function profilLaden(aktuellerNutzer) {
    if (!aktuellerNutzer) {
      setProfile(null);
      onUserChange?.(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id,email,name,role')
      .eq('id', aktuellerNutzer.id)
      .single();

    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    setProfile(data);
    onUserChange?.({ ...aktuellerNutzer, profile: data });
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user || null);
      profilLaden(data.user || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((ereignis, sitzung) => {
      // Der Link-Weg bleibt als Rueckfallebene bestehen: Wer eine aeltere
      // Mail mit Link hat und dessen Token noch unverbraucht ist, landet
      // weiterhin hier.
      if (ereignis === 'PASSWORD_RECOVERY') {
        setModus(MODUS.neuesPasswort);
        melde('Bitte lege ein neues Passwort fest.');
      }

      const aktuell = sitzung?.user || null;
      setUser(aktuell);
      profilLaden(aktuell);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ---------- Anmelden ----------
  async function anmelden(ereignis) {
    ereignis.preventDefault();
    setLaeuft(true);
    melde('Anmeldung läuft …');

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLaeuft(false);
    melde(
      error ? 'E-Mail oder Passwort stimmen nicht.' : 'Angemeldet.',
      error ? 'fehler' : 'ok',
    );
  }

  // ---------- Registrieren ----------
  async function registrieren() {
    if (!email || password.length < 6) {
      melde('Bitte E-Mail eingeben und ein Passwort mit mindestens sechs Zeichen wählen.', 'fehler');
      return;
    }

    setLaeuft(true);
    melde('Registrierung läuft …');

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    setLaeuft(false);

    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    setCode('');
    setModus(MODUS.codeRegistrierung);
    melde('Wir haben dir einen sechsstelligen Code geschickt. Trag ihn hier ein.', 'ok');
  }

  // ---------- Code der Registrierung ----------
  async function registrierungBestaetigen(ereignis) {
    ereignis.preventDefault();

    const ziffern = code.replace(/\D/g, '');
    if (ziffern.length !== 6) {
      melde('Der Code besteht aus sechs Ziffern.', 'fehler');
      return;
    }

    setLaeuft(true);
    melde('Code wird geprüft …');

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: ziffern, type: 'signup' });

    setLaeuft(false);

    if (error) {
      melde('Der Code stimmt nicht oder ist abgelaufen. Fordere einen neuen an.', 'fehler');
      return;
    }

    setCode('');
    setModus(MODUS.anmelden);
    melde('Konto bestätigt. Du bist angemeldet.', 'ok');
  }

  // ---------- Passwort vergessen ----------
  async function codeAnfordern() {
    if (!email) {
      melde('Bitte zuerst deine E-Mail-Adresse eingeben.', 'fehler');
      return;
    }

    setLaeuft(true);
    melde('Code wird versendet …');

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    setLaeuft(false);

    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    setCode('');
    setModus(MODUS.codeZuruecksetzen);
    melde('Wenn das Konto existiert, ist ein sechsstelliger Code unterwegs.', 'ok');
  }

  async function codeZuruecksetzenPruefen(ereignis) {
    ereignis.preventDefault();

    const ziffern = code.replace(/\D/g, '');
    if (ziffern.length !== 6) {
      melde('Der Code besteht aus sechs Ziffern.', 'fehler');
      return;
    }

    setLaeuft(true);
    melde('Code wird geprüft …');

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: ziffern, type: 'recovery' });

    setLaeuft(false);

    if (error) {
      melde('Der Code stimmt nicht oder ist abgelaufen. Fordere einen neuen an.', 'fehler');
      return;
    }

    setCode('');
    setModus(MODUS.neuesPasswort);
    melde('Code stimmt. Jetzt ein neues Passwort festlegen.', 'ok');
  }

  // ---------- Neues Passwort ----------
  async function passwortSpeichern(ereignis) {
    ereignis.preventDefault();

    if (neuesPasswort.length < 6) {
      melde('Das neue Passwort muss mindestens sechs Zeichen lang sein.', 'fehler');
      return;
    }

    setLaeuft(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: neuesPasswort });
    setLaeuft(false);

    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    setNeuesPasswort('');
    setModus(MODUS.anmelden);
    melde('Passwort geändert.', 'ok');
  }

  async function abmelden() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setModus(MODUS.anmelden);
    melde('Abgemeldet.');
  }

  const meldungsblock = status ? (
    <p className={`meldung${art ? ` meldung--${art}` : ''}`} role="status" aria-live="polite">
      {status}
    </p>
  ) : null;

  // ---------- Neues Passwort festlegen ----------
  if (modus === MODUS.neuesPasswort) {
    return (
      <section className="abschnitt">
        <div className="karte karte--gelb" style={{ maxWidth: 460 }}>
          <span className="ol">Konto</span>
          <h2>Neues Passwort</h2>
          <form onSubmit={passwortSpeichern} style={{ marginTop: 18 }}>
            <div className="feld">
              <label htmlFor="auth-neu">
                Neues Passwort <span className="pflicht" aria-hidden="true">*</span>
              </label>
              <input
                id="auth-neu"
                type="password"
                value={neuesPasswort}
                onChange={(e) => setNeuesPasswort(e.target.value)}
                placeholder="Mindestens sechs Zeichen"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            <button type="submit" className="taste taste--gelb" disabled={laeuft}>
              Passwort speichern
            </button>
          </form>
          {meldungsblock}
        </div>
      </section>
    );
  }

  // ---------- Code eintragen ----------
  if (modus === MODUS.codeRegistrierung || modus === MODUS.codeZuruecksetzen) {
    const istRegistrierung = modus === MODUS.codeRegistrierung;

    return (
      <section className="abschnitt">
        <div className="karte karte--gelb" style={{ maxWidth: 460 }}>
          <span className="ol">Konto</span>
          <h2>Code eintragen</h2>
          <p style={{ margin: '10px 0 18px', fontSize: 15 }}>
            An <strong>{email}</strong> ist ein sechsstelliger Code unterwegs.
            Er gilt eine Stunde.
          </p>

          <form onSubmit={istRegistrierung ? registrierungBestaetigen : codeZuruecksetzenPruefen}>
            <div className="feld">
              <label htmlFor="auth-code">
                Code <span className="pflicht" aria-hidden="true">*</span>
              </label>
              <input
                id="auth-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 24,
                  letterSpacing: '.35em',
                  textAlign: 'center',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="taste taste--gelb" disabled={laeuft}>
                {laeuft ? 'Wird geprüft …' : 'Bestätigen'}
              </button>
              <button
                type="button"
                className="taste taste--klar"
                onClick={() => {
                  setCode('');
                  setModus(MODUS.anmelden);
                  melde('');
                }}
              >
                Abbrechen
              </button>
            </div>
          </form>

          {meldungsblock}

          <p style={{ marginTop: 16, fontSize: 13.5, color: 'var(--weiss-50)' }}>
            Keine Mail bekommen? Schau im Spam-Ordner nach. Der Code steht im
            Text der Nachricht — du musst auf keinen Link klicken.
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
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
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
          <button type="button" className="taste taste--klar" onClick={abmelden}>
            Abmelden
          </button>
        </div>
        {meldungsblock}
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

        <form onSubmit={anmelden}>
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
            <button type="submit" className="taste taste--gelb" disabled={laeuft}>
              Anmelden
            </button>
            <button type="button" className="taste taste--klar" onClick={registrieren} disabled={laeuft}>
              Registrieren
            </button>
            <button
              type="button"
              onClick={codeAnfordern}
              disabled={laeuft}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--weiss-50)',
                cursor: 'pointer',
                fontSize: 13.5,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                minHeight: 48,
                padding: '0 4px',
                fontFamily: 'var(--disp)',
              }}
            >
              Passwort vergessen
            </button>
          </div>
        </form>

        {meldungsblock}
      </div>
    </section>
  );
}
