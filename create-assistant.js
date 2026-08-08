const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk_...", // ← hier dein Key
});

async function createAssistant() {
  const assistant = await openai.beta.assistants.create({
    name: "THW Learn AI Tutor",
    model: "gpt-4-turbo",
    tools: [{ type: "file_search" }],
    instructions: `Du bist ein KI-Tutor. Antworte NUR basierend auf Dokumenten. Gib IMMER die Quelle an.`,
  });

  console.log("ASSISTANT_ID:", assistant.id);
}

createAssistant().catch(console.error);
