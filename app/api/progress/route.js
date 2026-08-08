import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Lernfortschritt lesen und schreiben.
 *
 * Vorher stand die Benutzerkennung in der Adresszeile beziehungsweise im
 * Rumpf der Anfrage. Wer eine fremde Kennung kannte, konnte damit fremden
 * Lernfortschritt abfragen und fremden Fortschritt schreiben — ohne
 * Anmeldung. Jetzt kommt sie aus dem Token und nirgendwo sonst.
 *
 * Zweiter Punkt, der schlimmer war als er aussah: Die alte Fassung
 * bevorzugte den Service-Role-Key und fiel nur ersatzweise auf den
 * Anon-Key zurueck. Der Service-Role-Key haengt die Row-Level-Security
 * komplett aus. Er ist zur Zeit nicht gesetzt, deshalb griffen die Regeln
 * noch — aber sobald ihn jemand fuer irgendetwas eintraegt, waere diese
 * Route schlagartig ein offenes Scheunentor gewesen. Hier wird
 * ausschliesslich der Anon-Key mit dem Token des Benutzers verwendet.
 *
 * Ausbilder und Admins duerfen fremden Fortschritt lesen. Das entscheidet
 * die Datenbank ueber ihre Regeln, nicht dieser Code — deshalb wird eine
 * angefragte fremde Kennung einfach durchgereicht. Ist sie nicht erlaubt,
 * kommt eine leere Liste zurueck.
 */

function fehler(nachricht, status) {
  return NextResponse.json({ error: nachricht }, { status });
}

/** Angemeldeten Benutzer aus dem Token holen. */
async function anmeldung(req) {
  const kopf = req.headers.get('authorization') || '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : null;

  if (!token) {
    return { antwort: fehler('Bitte melde dich an.', 401) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('Fortschritt: Supabase-Konfiguration fehlt');
    return { antwort: fehler('Server ist nicht vollstaendig eingerichtet.', 500) };
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return { antwort: fehler('Anmeldung abgelaufen. Bitte melde dich erneut an.', 401) };
  }

  return { supabase, benutzer: data.user };
}

export async function GET(req) {
  const { supabase, benutzer, antwort } = await anmeldung(req);
  if (antwort) return antwort;

  // Ohne Angabe der eigene Fortschritt. Mit Angabe entscheidet die
  // Datenbank, ob der Blick erlaubt ist.
  const { searchParams } = new URL(req.url);
  const gefragteKennung = searchParams.get('userId') || benutzer.id;

  const { data, error } = await supabase
    .from('learning_progress')
    .select('id,user_id,chapter,completed_at,progress_percent,created_at')
    .eq('user_id', gefragteKennung)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Fortschritt: Lesen fehlgeschlagen:', error);
    return fehler('Der Lernfortschritt konnte nicht geladen werden.', 500);
  }

  const eintraege = data || [];
  const abgeschlossen = eintraege.filter(
    (e) => e.completed_at || e.progress_percent >= 100,
  ).length;
  const durchschnitt = eintraege.length
    ? Math.round(
        eintraege.reduce((summe, e) => summe + (e.progress_percent || 0), 0) /
          eintraege.length,
      )
    : 0;

  return NextResponse.json({
    userId: gefragteKennung,
    completed: abgeschlossen,
    total: eintraege.length,
    averageProgress: durchschnitt,
    items: eintraege,
  });
}

export async function POST(req) {
  const { supabase, benutzer, antwort } = await anmeldung(req);
  if (antwort) return antwort;

  let eingabe;
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage konnte nicht gelesen werden.', 400);
  }

  // Eine userId im Rumpf wird bewusst ignoriert. Fortschritt schreibt man
  // fuer sich selbst, fuer niemanden sonst.
  const kapitel =
    typeof eingabe?.chapter === 'string'
      ? eingabe.chapter.trim().replace(/\s+/g, ' ').slice(0, 200)
      : '';

  if (!kapitel) {
    return fehler('Bitte gib an, um welches Kapitel es geht.', 400);
  }

  const rohwert = Number(eingabe?.progressPercent);
  const prozent = Number.isFinite(rohwert)
    ? Math.max(0, Math.min(100, Math.round(rohwert)))
    : 0;

  const satz = {
    user_id: benutzer.id,
    chapter: kapitel,
    progress_percent: prozent,
    completed_at: prozent >= 100 ? new Date().toISOString() : null,
  };

  const { data: vorhanden, error: sucheFehler } = await supabase
    .from('learning_progress')
    .select('id')
    .eq('user_id', benutzer.id)
    .eq('chapter', kapitel)
    .maybeSingle();

  if (sucheFehler) {
    console.error('Fortschritt: Suche fehlgeschlagen:', sucheFehler);
    return fehler('Der Lernfortschritt konnte nicht gespeichert werden.', 500);
  }

  const abfrage = vorhanden?.id
    ? supabase.from('learning_progress').update(satz).eq('id', vorhanden.id)
    : supabase.from('learning_progress').insert(satz);

  const { data, error } = await abfrage.select().single();

  if (error) {
    console.error('Fortschritt: Schreiben fehlgeschlagen:', error);
    return fehler('Der Lernfortschritt konnte nicht gespeichert werden.', 500);
  }

  return NextResponse.json({ progress: data });
}
