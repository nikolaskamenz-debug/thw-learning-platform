import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

/**
 * Unterlage fachlich pruefen — freigeben oder ablehnen.
 *
 * Das ist das Glied, das die Pruefung mit der Wissensbasis verbindet.
 * Eine Datei bei OpenAI abzulegen reicht nicht: Der Assistent sucht ueber
 * file_search, und das liest ausschliesslich aus einem Vector Store. Erst
 * wenn die Datei dort eingehaengt ist, kann der KI-Ausbilder sie finden.
 *
 * Reihenfolge der Schritte ist bewusst gewaehlt:
 *
 *   Freigeben  — erst den Datensatz, dann den Vector Store. Scheitert das
 *                Einhaengen, wird der Datensatz zurueckgesetzt. Der
 *                gefaehrliche Zustand waere "in der Wissensbasis, aber
 *                nicht freigegeben" — dann koennte die KI aus ungeprueftem
 *                Material zitieren. Diese Reihenfolge kann ihn nicht
 *                erzeugen.
 *
 *   Ablehnen   — erst aus dem Vector Store heraus, dann der Datensatz.
 *                Wieder gilt: lieber zu frueh entfernt als zu spaet.
 *
 * Die Datei selbst bleibt bei OpenAI liegen. Wird eine Ablehnung spaeter
 * revidiert, muss sie nicht neu hochgeladen werden.
 */

const ERLAUBTE_STATUS = ['approved', 'rejected'];

function fehler(nachricht, status) {
  return NextResponse.json({ error: nachricht }, { status });
}

export async function POST(req) {
  // ---------- 1. Anmeldung ----------
  const kopf = req.headers.get('authorization') || '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : null;

  if (!token) {
    return fehler('Nicht angemeldet. Bitte melde dich erneut an.', 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Pruefung: Supabase-Konfiguration fehlt');
    return fehler('Server ist nicht vollstaendig eingerichtet.', 500);
  }

  // Anon-Key plus Benutzer-Token: die Regeln der Datenbank greifen mit.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authDaten, error: authFehler } = await supabase.auth.getUser();
  const benutzer = authDaten?.user;

  if (authFehler || !benutzer) {
    return fehler('Anmeldung abgelaufen. Bitte melde dich erneut an.', 401);
  }

  // ---------- 2. Rolle ----------
  const { data: profil, error: profilFehler } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', benutzer.id)
    .single();

  if (profilFehler || !profil) {
    return fehler('Profil konnte nicht geladen werden.', 403);
  }

  if (profil.role !== 'Admin') {
    return fehler('Nur Admins duerfen Unterlagen pruefen.', 403);
  }

  // ---------- 3. Eingaben ----------
  let eingabe;
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage konnte nicht gelesen werden.', 400);
  }

  const dokumentId = eingabe?.id;
  const neuerStatus = eingabe?.status;
  const rueckmeldung =
    typeof eingabe?.feedback === 'string'
      ? eingabe.feedback.trim().replace(/\s+/g, ' ').slice(0, 2000)
      : '';

  if (!dokumentId) {
    return fehler('Es wurde keine Unterlage angegeben.', 400);
  }

  if (!ERLAUBTE_STATUS.includes(neuerStatus)) {
    return fehler('Unbekannte Entscheidung.', 400);
  }

  // Eine Ablehnung ohne Begruendung hilft niemandem weiter.
  if (neuerStatus === 'rejected' && rueckmeldung.length < 3) {
    return fehler('Bitte begruende die Ablehnung.', 400);
  }

  // ---------- 4. Unterlage laden ----------
  const { data: dokument, error: ladeFehler } = await supabase
    .from('thw_documents')
    .select('id,title,status,openai_file_id,in_knowledge_base')
    .eq('id', dokumentId)
    .single();

  if (ladeFehler || !dokument) {
    return fehler('Die Unterlage wurde nicht gefunden.', 404);
  }

  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
  const openaiSchluessel = process.env.OPENAI_API_KEY;
  const kannWissensbasis = Boolean(
    vectorStoreId && openaiSchluessel && dokument.openai_file_id,
  );
  const openai = openaiSchluessel ? new OpenAI({ apiKey: openaiSchluessel }) : null;

  // ---------- 5a. Ablehnen ----------
  if (neuerStatus === 'rejected') {
    // Zuerst aus der Wissensbasis nehmen. Solange die Datei dort liegt,
    // kann die KI daraus zitieren — das muss als Erstes aufhoeren.
    let ausWissensbasis = dokument.in_knowledge_base;

    if (kannWissensbasis && dokument.in_knowledge_base) {
      try {
        await openai.vectorStores.files.del(vectorStoreId, dokument.openai_file_id);
        ausWissensbasis = false;
      } catch (err) {
        // 404 heisst: liegt ohnehin nicht mehr drin. Alles andere ist ein
        // echter Fehler, und dann darf die Ablehnung nicht als erledigt
        // gelten.
        if (err?.status === 404) {
          ausWissensbasis = false;
        } else {
          console.error('Pruefung: Entfernen aus der Wissensbasis fehlgeschlagen:', err);
          return fehler(
            'Die Unterlage konnte nicht aus der Wissensbasis entfernt werden. Sie bleibt vorerst freigegeben.',
            502,
          );
        }
      }
    }

    const { data: aktualisiert, error: schreibFehler } = await supabase
      .from('thw_documents')
      .update({
        status: 'rejected',
        review_feedback: rueckmeldung,
        reviewed_at: new Date().toISOString(),
        in_knowledge_base: ausWissensbasis,
      })
      .eq('id', dokumentId)
      .select('id,title,status,review_feedback,reviewed_at,in_knowledge_base')
      .single();

    if (schreibFehler) {
      console.error('Pruefung: Ablehnung konnte nicht gespeichert werden:', schreibFehler);
      return fehler('Die Entscheidung konnte nicht gespeichert werden.', 500);
    }

    return NextResponse.json({
      ok: true,
      document: aktualisiert,
      message: 'Unterlage abgelehnt und aus der Wissensbasis entfernt.',
    });
  }

  // ---------- 5b. Freigeben ----------
  const vorherStatus = dokument.status;
  const vorherWissensbasis = dokument.in_knowledge_base;

  const { error: schreibFehler } = await supabase
    .from('thw_documents')
    .update({
      status: 'approved',
      review_feedback: rueckmeldung || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', dokumentId);

  if (schreibFehler) {
    console.error('Pruefung: Freigabe konnte nicht gespeichert werden:', schreibFehler);
    return fehler('Die Entscheidung konnte nicht gespeichert werden.', 500);
  }

  if (!kannWissensbasis) {
    // Freigabe steht, aber die Wissensbasis ist nicht erreichbar. Das ist
    // kein Drama — es muss nur benannt werden, sonst wartet jemand
    // vergeblich darauf, dass die KI die Unterlage kennt.
    const grund = !dokument.openai_file_id
      ? 'Zu dieser Unterlage ist keine Datei bei OpenAI hinterlegt.'
      : 'Die Wissensbasis ist nicht eingerichtet.';

    return NextResponse.json({
      ok: true,
      document: { id: dokumentId, status: 'approved', in_knowledge_base: false },
      warnung: `${grund} Die Unterlage ist freigegeben, der KI-Ausbilder kennt sie aber noch nicht.`,
      message: 'Unterlage freigegeben.',
    });
  }

  try {
    await openai.vectorStores.files.create(vectorStoreId, {
      file_id: dokument.openai_file_id,
    });
  } catch (err) {
    // Schon eingehaengt? Dann ist das Ziel erreicht.
    const schonDrin =
      err?.status === 400 && /already/i.test(err?.message || '');

    if (!schonDrin) {
      console.error('Pruefung: Einhaengen in die Wissensbasis fehlgeschlagen:', err);

      // Zuruecknehmen — sonst steht "freigegeben" da, ohne dass es stimmt.
      const { error: rueckFehler } = await supabase
        .from('thw_documents')
        .update({ status: vorherStatus, in_knowledge_base: vorherWissensbasis })
        .eq('id', dokumentId);

      if (rueckFehler) {
        console.error('Pruefung: Ruecknahme fehlgeschlagen:', rueckFehler);
        return fehler(
          'Die Unterlage wurde freigegeben, konnte aber nicht in die Wissensbasis aufgenommen werden. Bitte pruefe den Eintrag von Hand.',
          502,
        );
      }

      return fehler(
        'Die Unterlage konnte nicht in die Wissensbasis aufgenommen werden. Die Freigabe wurde zurueckgenommen — bitte versuche es erneut.',
        502,
      );
    }
  }

  const { data: aktualisiert, error: markierFehler } = await supabase
    .from('thw_documents')
    .update({ in_knowledge_base: true })
    .eq('id', dokumentId)
    .select('id,title,status,review_feedback,reviewed_at,in_knowledge_base')
    .single();

  if (markierFehler) {
    console.error('Pruefung: Vermerk zur Wissensbasis fehlgeschlagen:', markierFehler);
    // Die Datei liegt jetzt im Vector Store, nur der Vermerk fehlt. Die
    // Freigabe selbst steht — also kein Fehler nach aussen, aber ein
    // Hinweis.
    return NextResponse.json({
      ok: true,
      document: { id: dokumentId, status: 'approved', in_knowledge_base: true },
      warnung: 'Freigabe gespeichert, der Vermerk zur Wissensbasis nicht. Bitte die Liste neu laden.',
      message: 'Unterlage freigegeben.',
    });
  }

  return NextResponse.json({
    ok: true,
    document: aktualisiert,
    message: 'Unterlage freigegeben. Der KI-Ausbilder kann sie ab sofort zitieren.',
  });
}
