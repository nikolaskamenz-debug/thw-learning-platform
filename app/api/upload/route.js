import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

/**
 * Lernunterlage hochladen.
 *
 * Ablauf:
 *   1. Anmeldung prüfen — ohne gültiges Token passiert nichts.
 *   2. Rolle prüfen — nur Ausbilder und Admins dürfen hochladen.
 *   3. Datei und Metadaten prüfen.
 *   4. Datei zu OpenAI übertragen.
 *   5. Datensatz in thw_documents anlegen, status = 'pending'.
 *
 * Wichtig: Es wird bewusst der Anon-Key zusammen mit dem Token des
 * Benutzers verwendet, nicht der Service-Role-Key. Dadurch greifen die
 * Row-Level-Security-Regeln der Datenbank auch hier — die Berechtigung
 * wird also zweimal geprüft, im Code und in der Datenbank.
 */

const ERLAUBTE_TYPEN = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function fehler(nachricht, status) {
  return NextResponse.json({ error: nachricht }, { status });
}

function text(formData, feld, maxLaenge) {
  const wert = formData.get(feld);
  if (typeof wert !== 'string') return '';
  return wert.trim().replace(/\s+/g, ' ').slice(0, maxLaenge);
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
    console.error('Upload: Supabase-Konfiguration fehlt');
    return fehler('Server ist nicht vollständig eingerichtet.', 500);
  }

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

  if (!['Ausbilder', 'Admin'].includes(profil.role)) {
    return fehler('Nur Ausbilder und Admins dürfen Unterlagen hochladen.', 403);
  }

  // ---------- 3. Eingaben ----------
  let formData;
  try {
    formData = await req.formData();
  } catch {
    return fehler('Die Anfrage konnte nicht gelesen werden.', 400);
  }

  const datei = formData.get('file');
  if (!datei || typeof datei === 'string') {
    return fehler('Bitte wähle eine Datei aus.', 400);
  }

  if (datei.size === 0) {
    return fehler('Die Datei ist leer.', 400);
  }

  if (datei.size > MAX_BYTES) {
    return fehler('Die Datei ist größer als 25 MB.', 400);
  }

  if (datei.type && !ERLAUBTE_TYPEN.includes(datei.type)) {
    return fehler('Erlaubt sind PDF, Word und Textdateien.', 400);
  }

  const titel = text(formData, 'title', 200);
  const beschreibung = text(formData, 'description', 2000);
  const kapitel = text(formData, 'chapter', 120);
  const seiteRoh = text(formData, 'page_number', 10);

  if (titel.length < 3) {
    return fehler('Bitte gib einen Titel mit mindestens drei Zeichen an.', 400);
  }

  let seite = null;
  if (seiteRoh) {
    const zahl = Number.parseInt(seiteRoh, 10);
    if (!Number.isInteger(zahl) || zahl < 1 || zahl > 99999) {
      return fehler('Die Seitenangabe muss eine Zahl zwischen 1 und 99999 sein.', 400);
    }
    seite = zahl;
  }

  // ---------- 4. Datei zu OpenAI ----------
  if (!process.env.OPENAI_API_KEY) {
    console.error('Upload: OPENAI_API_KEY fehlt');
    return fehler('Server ist nicht vollständig eingerichtet.', 500);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let openaiDatei;
  try {
    const puffer = await datei.arrayBuffer();
    openaiDatei = await openai.files.create({
      file: new File([puffer], datei.name, { type: datei.type || 'application/octet-stream' }),
      purpose: 'assistants',
    });
  } catch (err) {
    console.error('Upload zu OpenAI fehlgeschlagen:', err);
    return fehler('Die Datei konnte nicht übertragen werden. Bitte versuche es erneut.', 502);
  }

  // ---------- 5. Datensatz anlegen ----------
  const { data: dokument, error: dbFehler } = await supabase
    .from('thw_documents')
    .insert({
      title: titel,
      description: beschreibung || null,
      chapter: kapitel || null,
      page_number: seite,
      uploaded_by: benutzer.id,
      openai_file_id: openaiDatei.id,
      file_url: datei.name,
      status: 'pending',
    })
    .select('id,title,chapter,page_number,status,created_at')
    .single();

  if (dbFehler) {
    // Die Datei liegt bereits bei OpenAI. Ohne Datensatz wäre sie eine
    // Karteileiche, die niemand mehr zuordnen kann — also aufräumen.
    console.error('Upload: Datensatz konnte nicht angelegt werden:', dbFehler);
    try {
      await openai.files.del(openaiDatei.id);
    } catch (aufraeumFehler) {
      console.error('Upload: verwaiste OpenAI-Datei konnte nicht entfernt werden:', aufraeumFehler);
    }
    return fehler('Die Unterlage konnte nicht gespeichert werden.', 500);
  }

  return NextResponse.json({
    ok: true,
    document: dokument,
    fileName: datei.name,
    message: 'Hochgeladen. Die Unterlage wartet jetzt auf die fachliche Prüfung.',
  });
}
