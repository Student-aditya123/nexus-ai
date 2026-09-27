require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  console.log('API key loaded:', !!process.env.GEMINI_API_KEY);
  console.log('API key length:', process.env.GEMINI_API_KEY?.length || 0);

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({
    model: 'text-embedding-001'
  });

  try {
    const result = await model.embedContent(
      'This is a test sentence for Nexus AI.'
    );

    console.log('SUCCESS');
    console.log('Embedding dimensions:', result.embedding.values.length);
    console.log(
      'First 5 values:',
      result.embedding.values.slice(0, 5)
    );
  } catch (error) {
    console.error('FAILED');
    console.error('Message:', error.message);
    console.error('Status:', error.status);
    console.error('Full error:', error);
  }
}

test();