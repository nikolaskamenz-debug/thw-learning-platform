'use client';

import { useState } from 'react';

export default function UploadComponent({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleUpload(event) {
    event.preventDefault();
    if (!file) return;

    setUploading(true);
    setStatus('Datei wird hochgeladen ...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload fehlgeschlagen');

      setStatus(`Upload erfolgreich: ${data.fileName}`);
      onUploaded?.(data);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section>
      <h2>Lernunterlage hochladen</h2>
      <form onSubmit={handleUpload}>
        <input
          type="file"
          accept=".pdf,.txt,.doc,.docx"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
        <button type="submit" disabled={!file || uploading}>
          {uploading ? 'Lädt ...' : 'Hochladen'}
        </button>
      </form>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
