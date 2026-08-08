import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

/**
 * Frage an den KI-Ausbilder.
 *
 * Die Antwort kommt aus einem OpenAI-Assistenten mit file_search. Gesucht
 * wird ausschliesslich im Vector Store — dort liegen nur Unterlagen, die
 * ein Admin freigegeben hat. Ungeprueftes Material kann also nicht
 * zitiert werden.
 *
 * Zwei Dinge sind hier wichtiger, als sie aussehen:
 *
 *   Anmeldepflicht — ohne sie kann jeder, der die Adresse kennt, auf
 *   unsere Rechnung Anfragen an OpenAI stellen.
 *
 *   Quellenangabe — das Kernversprechen der Plattform. OpenAI liefert in
 *   den Annotationen nur Datei-Kennungen; die werden hier auf Titel,
 *   Kapitel und Seite aus thw_documents zurueckgefuehrt. Sonst stuende
 *   dort "file-abc123", und das hilft niemandem.
 */

// Ein Lauf dauert normalerweise ein paar Sekunden. Laenger als das hier
// wartet niemand freiwillig, und ohne Grenze wartet der Server ewig.
const MAX_WARTEZEIT_MS = 90_000;
const ABFRAGE_ABSTAND_MS = 800;
const MAX_FRAGE_LAENGE = 2000;

function fehler(nachricht, status) {
  return NextResponse.json({ error: nachricht }, { status });
}

/** Zitate aus den Annotationen auf lesbare Quellen zurueckfuehren. */
async function quellenAufloesen(supabase, annotationen) {
  const dateiIds = [
    ...new Set(
      annotationen
        .filter((a) => a.type === 'file_citation' && a.file_citation?.file_id)
        .map((a) => a.file_citation.file_id),
    ),
  ];

  if (dateiIds.length === 0) return [];

  const { data, error } = await supabase
    .from('thw_documents')
    .select('title,chapter,page_number,openai_file_id')
    .in('openai_file_id', dateiIds);

  if (error) {
    console.error('Chat: Quellen konnten nicht aufgeloest werden:', error);
    return [];
  }

  return (data || []).map((d) => {
    const teile = [d.title];
    if (d.chapter) teile.push(`Kap. ${d.chapter}`);
    if (d.page_number) teile.push(`S. ${d.page_number}`);
    return { text: teile.join(', '), title: d.title };
  });
}

export async function POST(req) {
  // ---------- 1. Anmeldung ----------
  const kopf = req.headers.get('authorization') || '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : null;

  if (!token) {
    return fehler('Bitte melde dich an, um den KI-Ausbilder zu nutzen.', 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Chat: Supabase-Konfiguration fehlt');
    return fehler('Server ist nicht vollstaendig eingerichtet.', 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authDaten, error: authFehler } = await supabase.auth.getUser();
  if (authFehler || !authDaten?.user) {
    return fehler('Anmeldung abgelaufen. Bitte melde dich erneut an.', 401);
  }

  // ---------- 2. Eingabe ----------
  let eingabe;
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage konnte nicht gelesen werden.', 400);
  }

  const frage =
    typeof eingabe?.message === 'string' ? eingabe.message.trim() : '';

  if (!frage) {
    return fehler('Bitte stelle eine Frage.', 400);
  }

  if (frage.length > MAX_FRAGE_LAENGE) {
    return fehler(`Bitte fasse dich kuerzer — hoechstens ${MAX_FRAGE_LAENGE} Zeichen.`, 400);
  }

  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_ASSISTANT_ID) {
    console.error('Chat: OpenAI-Konfiguration fehlt');
    return fehler('Der KI-Ausbilder ist noch nicht eingerichtet.', 503);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // ---------- 3. Lauf starten ----------
  let lauf;
  let thread;
  try {
    thread = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: frage,
    });

    lauf = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID,
    });
  } catch (err) {
    console.error('Chat: Anfrage an OpenAI fehlgeschlagen:', err);
    return fehler('Der KI-Ausbilder antwortet gerade nicht. Bitte versuche es spaeter erneut.', 502);
  }

  // ---------- 4. Auf die Antwort warten ----------
  const beginn = Date.now();

  try {
    while (['queued', 'in_progress', 'cancelling'].includes(lauf.status)) {
      if (Date.now() - beginn > MAX_WARTEZEIT_MS) {
        // Nicht einfach stehenlassen — ein Lauf, der weiterrechnet,
        // kostet Geld.
        try {
          await openai.beta.threads.runs.cancel(thread.id, lauf.id);
        } catch {
          /* schon beendet, egal */
        }
        return fehler('Die Antwort hat zu lange gedauert. Bitte stelle die Frage noch einmal.', 504);
      }

      await new Promise((weiter) => setTimeout(weiter, ABFRAGE_ABSTAND_MS));
      lauf = await openai.beta.threads.runs.retrieve(thread.id, lauf.id);
    }
  } catch (err) {
    console.error('Chat: Lauf konnte nicht abgefragt werden:', err);
    return fehler('Der KI-Ausbilder antwortet gerade nicht. Bitte versuche es spaeter erneut.', 502);
  }

  if (lauf.status !== 'completed') {
    // failed, cancelled, expired, incomplete, requires_action — in der
    // alten Fassung lief die Schleife hier endlos weiter.
    console.error('Chat: Lauf endete mit Status', lauf.status, lauf.last_error || '');
    return fehler('Der KI-Ausbilder konnte die Frage nicht beantworten. Bitte formuliere sie anders.', 502);
  }

  // ---------- 5. Antwort einsammeln ----------
  let nachrichten;
  try {
    nachrichten = await openai.beta.threads.messages.list(thread.id, { order: 'desc', limit: 10 });
  } catch (err) {
    console.error('Chat: Antwort konnte nicht gelesen werden:', err);
    return fehler('Die Antwort konnte nicht gelesen werden.', 502);
  }

  const antwortNachricht = nachrichten.data.find((n) => n.role === 'assistant');
  const textTeil = antwortNachricht?.content?.find((t) => t.type === 'text');

  if (!textTeil) {
    return fehler('Der KI-Ausbilder hat keine Antwort geliefert.', 502);
  }

  // content[0].text ist ein Objekt, nicht der Text. Der Wert steht in
  // .value — in der alten Fassung ging hier "[object Object]" nach vorn.
  let antwort = textTeil.text.value;
  const annotationen = textTeil.text.annotations || [];

  // Die eingestreuten Fundstellen-Marken sind fuer Menschen unlesbar.
  for (const anmerkung of annotationen) {
    if (anmerkung.text) {
      antwort = antwort.replace(anmerkung.text, '');
    }
  }
  antwort = antwort.replace(/[ \t]+\n/g, '\n').trim();

  const quellen = await quellenAufloesen(supabase, annotationen);

  return NextResponse.json({
    response: antwort,
    sources: quellen.length ? quellen.map((q) => q.text).join(' · ') : null,
    sourceList: quellen,
    threadId: thread.id,
  });
}
