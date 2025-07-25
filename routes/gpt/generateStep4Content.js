// routes/gpt/generateStep4Content.js
const { openai } = require('../../utils/openaiClient');
const { supabase } = require('../../utils/supabaseClient');
const validateStep4 = require('../../validators/validateStep4Content');

const promptTemplate = (topicTitle) => `
You are an expert USMLE medical educator. Generate structured JSON content for STEP 4: Clinical Reasoning Chat for the topic:

🔷 Topic:
${topicTitle}

🎯 OUTPUT FORMAT (strict):
{
  "step": 4,
  "content": [
    { "sender": "teacher", "html": "..." },
    { "sender": "student", "html": "..." },
    ...
  ]
}

✅ RULES:
- Exactly 60 chat messages.
- Must alternate between teacher and student.
- Use <strong> for key terms and <i> for clarifications.
- No headings or markdown.
- Must be NBME/UWorld/AMBOSS level.
`;

async function generateStep4Content(req, res) {
  const { topic_id, topic_title } = req.body;

  if (!topic_id || !topic_title) {
    return res.status(400).json({ error: 'Missing topic_id or topic_title' });
  }

  try {
    // 1. Generate GPT Response
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You generate structured JSON for clinical chat.' },
        { role: 'user', content: promptTemplate(topic_title) }
      ]
    });

    const rawText = chatCompletion.choices[0].message.content.trim();

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      return res.status(500).json({ error: '❌ Invalid JSON from OpenAI', raw: rawText });
    }

    // 2. Validate
    const isValid = validateStep4(parsed);
    if (!isValid) {
      return res.status(400).json({ error: '❌ JSON validation failed for Step 4 content', parsed });
    }

    // 3. Insert or Merge into Supabase
    const { data: existing } = await supabase
      .from('topic_uploads')
      .select('id, content')
      .eq('topic_id', topic_id)
      .limit(1);

    if (existing && existing.length > 0) {
      const currentContent = existing[0].content || { steps: [] };
      const filtered = currentContent.steps.filter((s) => s.step !== 4);
      const updatedSteps = [...filtered, parsed];

      await supabase
        .from('topic_uploads')
        .update({ content: { steps: updatedSteps } })
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('topic_uploads')
        .insert({
          topic_id,
          content: { steps: [parsed] }
        });
    }

    return res.status(200).json({ success: true, step: 4, inserted: parsed });
  } catch (err) {
    console.error('❌ Step 4 generation error:', err);
    return res.status(500).json({ error: '❌ Server error during Step 4 generation', details: err.message });
  }
}

module.exports = generateStep4Content;
