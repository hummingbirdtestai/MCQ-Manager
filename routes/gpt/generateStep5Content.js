const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function generateContent(topic_title) {
  const prompt = `Only output valid JSON. Do not use markdown, headings, or commentary. Do not wrap JSON in \`\`\`json.

You are expert USMLE Step 1 and Step 2 coaching classes Mentor.

The following is a Topic Name. Identify 10 Learning Gaps that a Student may have to Learn this Topic in MBBS. The Learning Gaps may be the facts linked to the Topic and background topics where the lacuna can hinder the progress of the Student to understand this Topic.

Create One USMLE-Styled Clinical Case Vignette-based MCQ per Learning Gap — so for 10 Learning Gaps, 10 MCQs are created.

Every MCQ must have:
- A 5–6 sentence clinical vignette as the stem (include age, gender, symptoms, labs, imaging if needed).
- 5 Options labeled A–E.
- 1 correct answer.
- A detailed 10-sentence explanation.

✅ FORMAT:

{
  "step": 5,
  "content": {
    "status": "success",
    "topic": "${topic_title}",
    "mcqs": [
      {
        "learning_gap": "...",
        "stem": "...",
        "options": {
          "A": "...",
          "B": "...",
          "C": "...",
          "D": "...",
          "E": "..."
        },
        "correct_answer": "B",
        "explanation": "..."
      }
    ]
  }
}
`;

  const chatCompletion = await openai.chat.completions.create({
    model: 'gpt-4-1106-preview',
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: 'You are an expert USMLE-level medical educator. Follow all output rules and generate valid structured JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return chatCompletion.choices[0].message.content;
}

module.exports = async (req, res) => {
  const { topic_id, topic_title } = req.body;

  if (!topic_id || !topic_title) {
    return res.status(400).json({ error: 'topic_id and topic_title are required' });
  }

  let gptOutputRaw = '';
  let parsed = null;
  let retry = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      gptOutputRaw = await generateContent(topic_title);
      console.log(`📤 GPT Raw Output [Attempt ${attempt}]:`, gptOutputRaw);

      const cleaned = gptOutputRaw
        .trim()
        .replace(/^```json/, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .replace(/\u200B/g, '');

      parsed = JSON.parse(cleaned);

      if (
        parsed.step === 5 &&
        parsed.content &&
        Array.isArray(parsed.content.mcqs) &&
        parsed.content.mcqs.length === 10
      ) {
        break; // ✅ Valid output
      } else {
        throw new Error('Step 5 structure is incomplete or incorrect');
      }
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed:`, err.message);
      if (attempt === 2) {
        return res.status(400).json({ error: 'Missing or invalid Step 5 MCQ structure' });
      }
      retry = true;
    }
  }

  const finalPayload = { steps: [parsed] };

  const { data, error } = await supabase
    .from('topic_uploads')
    .insert({ topic_id, content: finalPayload })
    .select()
    .single();

  if (error) {
    console.error('❌ Supabase Insert Error:', error.message);
    return res.status(500).json({ error: 'Supabase insert failed: ' + error.message });
  }

  return res.status(200).json({ message: '✅ Step 5 MCQs successfully generated and stored', data });
};
