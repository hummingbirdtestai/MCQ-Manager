// routes/gpt/generateStep4Content.js

const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const promptTemplate = (topic_title) => `Only output valid JSON. Do not use markdown, headings, or commentary. Do not wrap JSON in \`\`\`json.

You are an expert USMLE medical educator. Generate structured JSON content for STEP 4: Clinical Reasoning Chat.

🔷 Topic:
${topic_title}

✅ RULES:
- Output must be:
{
  "step": 4,
  "content": [
    { "sender": "teacher", "html": "..." },
    { "sender": "student", "html": "..." },
    ...
  ]
}

- Exactly 60 messages alternating between teacher and student.
- Use <strong> for keywords and <i> for clarifications.
- No markdown, no explanations outside the JSON.
- Content should match NBME/UWorld/AMBOSS standard.
`;

module.exports = async (req, res) => {
  const { topic_id, topic_title } = req.body;

  if (!topic_id || !topic_title) {
    return res.status(400).json({ error: '❌ topic_id and topic_title are required' });
  }

  try {
    // 1. Generate GPT output
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'You are a USMLE-level medical educator generating valid JSON clinical chat.'
        },
        {
          role: 'user',
          content: promptTemplate(topic_title)
        }
      ]
    });

    const gptOutputRaw = chatCompletion.choices[0].message.content;
    console.log('📤 GPT Raw Output:', gptOutputRaw);

    // 2. Clean output
    const cleaned = gptOutputRaw.trim()
      .replace(/^```json/, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .replace(/\u200B/g, '');

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error('❌ JSON Parse Error:', err.message);
      return res.status(500).json({ error: '❌ Invalid JSON format from GPT output', raw: gptOutputRaw });
    }

    // 3. Validation
    if (
      !parsed ||
      parsed.step !== 4 ||
      !Array.isArray(parsed.content) ||
      parsed.content.length !== 60
    ) {
      return res.status(400).json({ error: '❌ Step 4 format invalid or content not 60 messages', parsed });
    }

    // 4. Merge into Supabase
    const { data: existing, error: fetchError } = await supabase
      .from('topic_uploads')
      .select('id, content')
      .eq('topic_id', topic_id)
      .limit(1);

    if (fetchError) {
      console.error('❌ Supabase fetch error:', fetchError.message);
      return res.status(500).json({ error: '❌ Failed to fetch existing uploads' });
    }

    if (existing && existing.length > 0) {
      const currentSteps = existing[0].content?.steps || [];
      const withoutStep4 = currentSteps.filter((s) => s.step !== 4);
      const updatedSteps = [...withoutStep4, parsed];

      const { error: updateError } = await supabase
        .from('topic_uploads')
        .update({ content: { steps: updatedSteps } })
        .eq('id', existing[0].id);

      if (updateError) {
        console.error('❌ Supabase update error:', updateError.message);
        return res.status(500).json({ error: '❌ Failed to update topic_uploads' });
      }
    } else {
      const { error: insertError } = await supabase
        .from('topic_uploads')
        .insert({ topic_id, content: { steps: [parsed] } });

      if (insertError) {
        console.error('❌ Supabase insert error:', insertError.message);
        return res.status(500).json({ error: '❌ Failed to insert new topic_uploads' });
      }
    }

    return res.status(200).json({ message: '✅ Step 4 GPT content generated and stored', step: 4, data: parsed });
  } catch (err) {
    console.error('❌ GPT Generation Error:', err.message);
    return res.status(500).json({ error: '❌ GPT or Supabase error', details: err.message });
  }
};
