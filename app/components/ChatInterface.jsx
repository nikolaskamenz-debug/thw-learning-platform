'use client';

import { useState } from 'react';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>THW Learn AI</h1>
      <div style={{ height: '400px', border: '1px solid #ccc', overflowY: 'auto', marginBottom: '10px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ padding: '5px', background: m.role === 'user' ? '#e3f2fd' : '#f5f5f5' }}>
            <strong>{m.role}:</strong> {m.content}
          </div>
        ))}
      </div>
      <input value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} placeholder="Frage..." style={{ width: '80%', padding: '10px' }} disabled={loading} />
      <button onClick={handleSendMessage} disabled={loading} style={{ padding: '10px 20px' }}>Senden</button>
    </div>
  );
}
