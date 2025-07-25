const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async (req, res) => {
  const { topic_id, topic_title } = req.body;

  if (!topic_id || !topic_title) {
    return res.status(400).json({ error: 'topic_id and topic_title are required' });
  }

  const prompt = `Only output valid JSON. Do not use markdown, headings, or commentary. Do not wrap JSON in \`\`\`json.

Your mission is to create high-yield, clinically precise content tailored to prepare medical students at the level of AMBOSS / UWorld / NBME standards.

🎯 OBJECTIVE:
Generate structured JSON content for a React-based mobile learning platform.

🔷 TOPIC:
${topic_title}

🔷 CONTENT CREATION RULES:
✅ General Rules for Output:

Output must be a valid JSON object starting with { and ending with }.

Do not include any explanations, markdown, headings, or commentary.

Do not include HTML page structure like <html>, <head>, <style>, or <script>.

Emojis are allowed.

Inline formatting <strong> for keywords and <i> for clarifications is allowed.

Content must be clean, high-yield, and clinically aligned with AMBOSS, UWorld, NBME quality.

Ensure JSON can be parsed directly into a React app.

🔷 STEP 1: CLINICAL TEACHER–STUDENT CHAT
Simulate a detailed 30-message conversation between a teacher 👨‍🏫 and a student 🧑‍🎓 about the topic. Include teaching questions, answers, clinical reasoning, concept explanation, and visual analogies.
Output: {"step": 1, "content": [{ "sender": "teacher", "html": "..." }, { "sender": "student", "html": "..." }, ...]}

🔷 STEP 2: BUZZWORD ACTIVE RECALL TABLE
Create a 30-row 2-column table where Column A is a buzzword (frequently tested keyword or term), and Column B is the high-yield point it refers to.
Output: {"step": 2, "content": [{ "buzzword": "...", "highYieldPoint": "..." }, ...]}

🔷 STEP 3: HIGH-YIELD MASTERY TABLE
Create another 30-row 2-column table of high-yield clinical insights and memory anchors.
Column A = Fact / Clinical Insight.
Column B = Clarifying explanation, hint, or pathophysiology link.
Output: {"step": 3, "content": [{ "buzzword": "...", "clarifyingFact": "..." }, ...]}

📦 FINAL OUTPUT FORMAT:
Wrap all 3 steps inside one object like this:
{
  "steps": [
    { "step": 1, "content": [...] },
    { "step": 2, "content": [...] },
    { "step": 3, "content": [...] }
  ]
}
`;

  try {
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

    const gptOutputRaw = chatCompletion.choices[0].message.content;
    console.log('📤 GPT Raw Output:', gptOutputRaw);

    // Clean up any markdown wrappers and hidden characters
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
      return res.status(500).json({ error: 'Invalid JSON format from GPT output' });
    }

    if (
      !Array.isArray(parsed.steps) ||
      !parsed.steps.some((s) => s.step === 1) ||
      !parsed.steps.some((s) => s.step === 2) ||
      !parsed.steps.some((s) => s.step === 3)
    ) {
      return res.status(400).json({ error: 'Missing required steps (1–3) in GPT output' });
    }

    const { data, error } = await supabase
      .from('topic_uploads')
      .insert({ topic_id, content: parsed })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase Insert Error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ message: '✅ Step 1–3 GPT content generated and stored', data });
  } catch (err) {
    console.error('❌ GPT Generation Error:', err.message);
    res.status(500).json({ error: 'Failed to generate step 1–3 content' });
  }
};
