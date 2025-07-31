const { OpenAI } = require('openai');
const { supabase } = require('../../utils/supabaseClient');
const validateStep4Content = require('../validators/validateStep4Content');
const { v4: uuidv4 } = require('uuid');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractAndInsertMCQsFromStep4(step4Content, topicId) {
  const mcqsToInsert = [];

  for (const caseData of step4Content.content || []) {
    const chat = caseData.chat;
    for (let i = 0; i < chat.length - 1; i++) {
      const msg1 = chat[i];
      const msg2 = chat[i + 1];

      if (
        msg1.sender === 'teacher' &&
        /which of the following/i.test(msg1.html) &&
        msg2.sender === 'student'
      ) {
        mcqsToInsert.push({
          id: uuidv4(),
          topic_id: topicId,
          stem: msg1.html,
          options: ['Option A', 'Option B', 'Option C', 'Option D', 'Option E'], // Placeholder
          correct_answer: 'A', // Placeholder
          explanation: msg2.html,
          source: 'step4',
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  if (mcqsToInsert.length > 0) {
    const { error } = await supabase.from('mcqs').insert(mcqsToInsert);
    if (error) {
      console.error('❌ Error inserting MCQs:', error.message);
    } else {
      console.log(`✅ Inserted ${mcqsToInsert.length} MCQs from Step 4`);
    }
  }
}

module.exports = async (req, res) => {
  const { topic_id, topic_title } = req.body;

  if (!topic_id || !topic_title) {
    return res.status(400).json({ error: '❌ Missing topic_id or topic_title' });
  }

  const systemPrompt = `
🚨 OUTPUT RULES:
- Output must be a valid JSON object with exactly 5 clinical cases.
- Each case must contain 10 messages alternating between teacher and student.
- Total = 50 messages (5 × 10), alternating roles.
- Format: { step: 4, content: [ { case_title: "...", chat: [ { sender: "...", html: "..." }, ... ] }, ... ] }

🎯 GOAL: Generate USMLE-style clinical reasoning chat on: "${topic_title}"
👨‍⚕️ Audience: MBBS students preparing for NEETPG, INICET, FMGE, USMLE.
💬 Style: High-yield clinical chat, accurate reasoning, HTML formatting, bold key terms using <strong>.

Only return valid JSON.
`;

  let step4Content = null;
  let success = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-0613',
        messages: [
          {
            role: 'system',
            content: systemPrompt.trim(),
          },
        ],
        temperature: 0.7,
      });

      const rawOutput = response.choices?.[0]?.message?.content?.trim() || '';

      try {
        const parsed = JSON.parse(rawOutput);
        const isValid = validateStep4Content(parsed);

        if (!isValid) throw new Error('Validation failed for Step 4 JSON');

        step4Content = parsed;
        success = true;
        break;
      } catch (jsonError) {
        console.warn(`⚠️ Attempt ${attempt} failed to parse JSON`);
        await delay(1000);
      }
    } catch (err) {
      console.error(`❌ GPT attempt ${attempt} failed:`, err.message);
      await delay(1000);
    }
  }

  if (!success) {
    return res.status(400).json({
      error: '❌ GPT failed to return valid Step 4 JSON with 50 messages after 3 attempts',
    });
  }

  // 🟩 Store Step 4 in Supabase topic_uploads
  const { error: uploadError } = await supabase.from('topic_uploads').upsert([
    {
      topic_id,
      step: 4,
      content: step4Content,
      updated_at: new Date().toISOString(),
    },
  ]);

  if (uploadError) {
    return res.status(500).json({ error: '❌ Failed to store Step 4 content' });
  }

  // ✅ Extract and insert MCQs into mcqs table
  await extractAndInsertMCQsFromStep4(step4Content, topic_id);

  return res.status(200).json({
    message: '✅ Step 4 content saved successfully',
    data: step4Content,
  });
};
