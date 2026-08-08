'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

/**
 * Lernfortschritt eines Benutzers.
 *
 * Die Kennung geht weiterhin an die Route mit — nicht damit sich jemand
 * ausweist, sondern damit Ausbilder den Fortschritt ihrer Schueler sehen
 * koennen. Wer wirklich fragt, steht im Token; ob der Blick auf fremde
 * Daten erlaubt ist, entscheidet die Datenbank.
 */
export default function ProgressTracker({ userId }) {
  const [fortschritt, setFortschritt] = useState(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(true);

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sitzung } = await supabase.auth.getSession();
      const token = sitzung?.session?.access_token;

      if (!token) {
        throw new Error('Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
      }

      const adresse = userId
        ? `/api/progress?userId=${encodeURIComponent(userId)}`
        : '/api/progress';

      const antwort = await fetch(adresse, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const daten = await antwort.json();

      if (!antwort.ok) {
        throw new Error(daten.error || 'Der Lernfortschritt konnte nicht geladen werden.');
      }

      setFortschritt(daten);
    } catch (err) {
      setFehler(err.message);
    } finally {
      setLaedt(false);
    }
  }, [userId]);

  useEffect(() => {
    laden();
  }, [laden]);

  const anteil =
    fortschritt && fortschritt.total > 0
      ? Math.round((fortschritt.completed / fortschritt.total) * 100)
      : 0;

  return (
    <section className="abschnitt">
      <div className="karte">
        <span className="ol">Fortschritt</span>
        <h2>Wie weit du bist</h2>

        {laedt && (
          <p style={{ color: 'var(--weiss-50)', marginTop: 12 }}>Wird geladen …</p>
        )}

        {!laedt && fehler && (
          <p className="meldung meldung--fehler" role="status">
            {fehler}
          </p>
        )}

        {!laedt && !fehler && fortschritt && fortschritt.total === 0 && (
          <p style={{ color: 'var(--weiss-50)', margin: '12px 0 0' }}>
            Noch kein Kapitel begonnen. Sobald du anfängst, steht hier, wie weit du bist.
          </p>
        )}

        {!laedt && !fehler && fortschritt && fortschritt.total > 0 && (
          <>
            <p
              className="kennzahl__wert"
              style={{ margin: '14px 0 6px' }}
              aria-hidden="true"
            >
              {anteil} %
            </p>

            <div
              className="balken"
              role="progressbar"
              aria-valuenow={anteil}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${anteil} Prozent abgeschlossen`}
            >
              <span style={{ width: `${anteil}%` }} />
            </div>

            <p style={{ margin: '12px 0 0', fontSize: 14.5 }}>
              {fortschritt.completed} von {fortschritt.total}{' '}
              {fortschritt.total === 1 ? 'Kapitel' : 'Kapiteln'} abgeschlossen
              {fortschritt.averageProgress > 0 && fortschritt.completed < fortschritt.total
                ? ` · im Schnitt ${fortschritt.averageProgress} % je Kapitel`
                : ''}
              .
            </p>
          </>
        )}

        <button
          type="button"
          className="taste taste--klar"
          onClick={laden}
          disabled={laedt}
          style={{ marginTop: 18, minHeight: 42, fontSize: 14 }}
        >
          {laedt ? 'Lädt …' : 'Aktualisieren'}
        </button>
      </div>
    </section>
  );
}
