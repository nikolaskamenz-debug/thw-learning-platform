import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'File required' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const uploadedFile = await openai.beta.files.upload({
      file: new File([buffer], file.name, { type: file.type }),
      purpose: 'assistants',
    });

    return NextResponse.json({
      fileId: uploadedFile.id,
      fileName: uploadedFile.filename,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
