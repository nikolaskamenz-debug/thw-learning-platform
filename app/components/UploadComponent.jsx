'use client';

import { useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

const LEER = { title: '', description: '', chapter: '', page_number: '' };

export default function UploadComponent({ onUploaded }) {
  const [datei, setDatei] = useState(null);
  const [werte, setWerte] = useState(LEER);
  const [meldung, setMeldung] = useState('');
  const [art, setArt] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const dateiFeld = useRef(null);

  function aendern(feld, wert) {
    setWerte((aktuell) => ({ ...aktuell, [feld]: wert }));
  }

  function melde(text, artDerMeldung = '') {
    setMeldung(text);
    setArt(artDerMeldung);
  }

  async function hochladen(event) {
    event.preventDefault();

    if (!datei) {
      melde('Bitte wähle eine Datei aus.', 'fehler');
      return;
    }
    if (werte.title.trim().length < 3) {
      melde('Bitte gib einen Titel mit mindestens drei Zeichen an.', 'fehler');
      return;
    }

    setLaeuft(true);
    melde('Unterlage wird übertragen …');

    try {
      // Das Zugangstoken mitschicken, damit die API die Berechtigung
      // prüfen kann. Ohne gültiges Token nimmt sie nichts entgegen.
      const supabase = getSupabaseBrowserClient();
      const { data: sitzung } = await supabase.auth.getSession();
      const token = sitzung?.session?.access_token;

      if (!token) {
        throw new Error('Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
      }

      const formular = new FormData();
      formular.append('file', datei);
      formular.append('title', werte.title);
      formular.append('description', werte.description);
      formular.append('chapter', werte.chapter);
      formular.append('page_number', werte.page_number);

      const antwort = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formular,
      });

      const daten = await antwort.json().catch(() => ({}));
      if (!antwort.ok) throw new Error(daten.error || 'Der Upload ist fehlgeschlagen.');

      melde(daten.message || 'Hochgeladen. Die Unterlage wartet auf die Prüfung.', 'ok');
      setWerte(LEER);
      setDatei(null);
      if (dateiFeld.current) dateiFeld.current.value = '';
      onUploaded?.(daten);
    } catch (fehler) {
      melde(fehler.message, 'fehler');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section className="abschnitt">
      <div className="karte karte--gelb">
        <span className="ol">Lernmaterial</span>
        <h2>Unterlage hochladen</h2>
        <p style={{ marginBottom: 22, fontSize: 15 }}>
          Nur freigegebene Originalunterlagen. Nach dem Hochladen prüft ein Admin
          die Unterlage, bevor sie für Schüler und den KI-Tutor verfügbar wird.
        </p>

        <form onSubmit={hochladen}>
          <div className="feld">
            <label htmlFor="up-datei">
              Datei <span className="pflicht" aria-hidden="true">*</span>
            </label>
            <input
              id="up-datei"
              ref={dateiFeld}
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              onChange={(e) => setDatei(e.target.files?.[0] || null)}
              aria-describedby="up-datei-hilfe"
            />
            <span className="feld__hilfe" id="up-datei-hilfe">
              PDF, Word oder Text, höchstens 25 MB.
              {datei ? ` Gewählt: ${datei.name} (${Math.round(datei.size / 1024)} KB)` : ''}
            </span>
          </div>

          <div className="feld">
            <label htmlFor="up-titel">
              Titel <span className="pflicht" aria-hidden="true">*</span>
            </label>
            <input
              id="up-titel"
              type="text"
              value={werte.title}
              onChange={(e) => aendern('title', e.target.value)}
              placeholder="Zum Beispiel: Lernabschnitt Beleuchtung"
              maxLength={200}
              required
            />
          </div>

          <div className="feld">
            <label htmlFor="up-beschreibung">
              Beschreibung <span className="freiwillig">(freiwillig)</span>
            </label>
            <textarea
              id="up-beschreibung"
              value={werte.description}
              onChange={(e) => aendern('description', e.target.value)}
              placeholder="Worum geht es in dieser Unterlage? Hilft beim Prüfen."
              maxLength={2000}
            />
          </div>

          <div className="feldreihe feldreihe--zwei">
            <div className="feld">
              <label htmlFor="up-kapitel">
                Kapitel <span className="freiwillig">(freiwillig)</span>
              </label>
              <input
                id="up-kapitel"
                type="text"
                value={werte.chapter}
                onChange={(e) => aendern('chapter', e.target.value)}
                placeholder="4.2.3"
                maxLength={120}
                aria-describedby="up-kapitel-hilfe"
              />
              <span className="feld__hilfe" id="up-kapitel-hilfe">
                Wird später als Quellenangabe angezeigt.
              </span>
            </div>

            <div className="feld">
              <label htmlFor="up-seite">
                Seite <span className="freiwillig">(freiwillig)</span>
              </label>
              <input
                id="up-seite"
                type="number"
                min="1"
                max="99999"
                value={werte.page_number}
                onChange={(e) => aendern('page_number', e.target.value)}
                placeholder="187"
              />
            </div>
          </div>

          <button type="submit" className="taste taste--gelb" disabled={laeuft}>
            {laeuft ? 'Wird übertragen …' : 'Hochladen und zur Prüfung geben'}
          </button>

          <p
            className={`meldung${art ? ` meldung--${art}` : ''}`}
            role="status"
            aria-live="polite"
          >
            {meldung}
          </p>
        </form>
      </div>
    </section>
  );
}
