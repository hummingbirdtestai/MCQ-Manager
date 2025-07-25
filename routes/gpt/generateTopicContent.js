const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const stepPrompts = [
  (title) => `You are a medical teacher. Step 1: Create a 30-message teacher-student chat for "${title}". Output only JSON: {"step":1,"content":[{...}]}`,
  (title) => `Step 2: Create 30-row buzzword recall table for "${title}" in JSON: {"step":2,"content":[{buzzword,highYieldPoint,clarifyingFact}]}`,
  (title) => `Step 3: Create a 30-row high-yield mastery table for "${title}". Return JSON: {"step":3,"content":[{buzzword,highYieldPoint,clarifyingFact}]}`,
  (title) => `Step 4: Create 60 clinical chat messages on "${title}" between doctor and student. Return JSON: {"step":4,"content":[{sender,html}]}`,
  (title) => `Step 5: Create 10 MCQs for "${title}" with explanation and learning_gap. Output JSON: {"step":5,"content":[{stem, options: {A,B,C,D,E}, correct_answer, explanation, learning_gap}]}`,
  (title) => `Step 6: Generate 10 media keywords and YouTube/video suggestions for "${title}". Output JSON: {"step":6,"content":[{keyword,description}]}`
];

const parseGPT = async (fn, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const chat = await fn();
      return JSON.parse(chat.choices[0].message.content);
    } catch (err) {
      console.error(`❌ Error parsing GPT response (Attempt ${attempt + 1}):`, err.message);
      if (attempt === retries) throw err;
    }
  }
};

module.exports = async (req, res) => {
  const { topic_id, topic_title } = req.body;
  if (!topic_id || !topic_title) return res.status(400).json({ error: 'topic_id and topic_title are required' });

  try {
    const steps = [];

    for (let i = 0; i < 6; i++) {
      const prompt = stepPrompts[i](topic_title);

      const result = await parseGPT(() =>
        openai.chat.completions.create({
          model: 'gpt-4-1106-preview',
          messages: [
            {
              role: 'system',
              content: 'You are a strict JSON generator. Output ONLY valid JSON starting with { and ending with } without any explanations, markdown, or commentary.'
            },
            { role: 'user', content: prompt }
          ]
        })
      );

      if (!result || !Array.isArray(result.content)) {
        throw new Error(`Step ${i + 1} content is invalid or missing`);
      }

      steps.push(result); // push full step object {step, content}
    }

    const finalContent = { steps };

    const step5 = finalContent.steps.find((s) => s.step === 5);
    if (
      !step5 ||
      !Array.isArray(step5.content) ||
      !step5.content.every((m) =>
        m.stem && m.options && m.correct_answer && m.explanation && m.learning_gap
      )
    ) {
      return res.status(400).json({ error: 'Invalid MCQ format in Step 5' });
    }

    const { data, error } = await supabase
      .from('topic_uploads')
      .insert({ topic_id, content: finalContent })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json({ message: '✅ GPT content generated and stored', data });
  } catch (err) {
    console.error('❌ GPT Content Error:', err.message);
    res.status(500).json({ error: 'Failed to generate content' });
  }
};
