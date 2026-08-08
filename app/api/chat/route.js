import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { message, userId } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Chat mit OpenAI Assistant
    const thread = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID,
    });

    // Warte auf Completion
    let completedRun = run;
    while (completedRun.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      completedRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    // Get Messages
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data[0];

    return NextResponse.json({
      response: assistantMessage.content[0].text,
      threadId: thread.id,
    });
  } catch (error) {
    console.error('Chat Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
