const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const promptTemplate = (topic_title) => `Only output valid JSON. Do not use markdown or commentary. Do not wrap JSON in \`\`\`.

You are an expert USMLE medical educator. Generate structured JSON content for:

🔷 STEP 4: Clinical Reasoning Chat  
🔷 Topic: ${topic_title}

✅ FORMAT:
{
  "step": 4,
  "content": [
    { "sender": "teacher", "html": "..." },
    { "sender": "student", "html": "..." },
    ...
  ]
}

✅ RULES:
- Exactly 60 messages alternating teacher/student.
- Use <strong> for keywords and <i> for clarifications.
- Match AMBOSS / UWorld / NBME-level depth.
- Output must be valid JSON only.`;

async function tryGenerateStep4(topic_title) {
  const chatCompletion = await openai.chat.completions.create({
    model: 'gpt-4-1106-preview',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: 'You are a USMLE-level educator. Return only valid JSON for Step 4.'
      },
      {
        role: 'user',
        content: promptTemplate(topic_title)
      }
    ]
  });

  const raw = chatCompletion.choices[0].message.content.trim();
  const cleaned = raw
    .replace(/^```json/, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .replace(/\u200B/g, '');

  try {
    const parsed = JSON.parse(cleaned);
    if (
      parsed?.step === 4 &&
      Array.isArray(parsed.content) &&
      parsed.content.length === 60
    ) {
      return parsed;
    }
  } catch (e) {
    // Continue retry
  }

  return null;
}

module.exports = async (req, res) => {
  const { topic_id, topic_title } = req.body;

  if (!topic_id || !topic_title) {
    return res.status(400).json({ error: '❌ topic_id and topic_title are required' });
  }

  let parsed = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    parsed = await tryGenerateStep4(topic_title);
    if (parsed) break;
    console.warn(`⚠️ GPT output invalid on attempt ${attempt}. Retrying...`);
  }

  if (!parsed) {
    return res.status(400).json({ error: '❌ GPT failed to return valid Step 4 JSON with 60 messages' });
  }

  try {
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
      const filtered = currentSteps.filter((s) => s.step !== 4);
      const updatedSteps = [...filtered, parsed];

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

    return res.status(200).json({
      message: '✅ Step 4 GPT content generated and stored',
      step: 4,
      data: parsed
    });
  } catch (err) {
    console.error('❌ GPT Generation Error:', err.message);
    return res.status(500).json({ error: '❌ GPT or Supabase error', details: err.message });
  }
};
