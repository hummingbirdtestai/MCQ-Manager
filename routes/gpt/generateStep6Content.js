const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function generateStep6(topic_title) {
  const prompt = `Only output valid JSON. Do not wrap with markdown or comments.

You are an expert medical educator who creates high-yield, exam-focused content for USMLE, NBME, AMBOSS, and UWorld.

Topic: "${topic_title}"

Task: Generate a Media Library for this topic.

✅ FORMAT:
{
  "content": {
    "steps": [
      {
        "step": 6,
        "content": [
          {
            "videos": [
              {
                "keyword": "Keyword for video",
                "description": "Short educational description about this video"
              }
            ],
            "images": [
              {
                "keyword": "Keyword for image",
                "description": "Short educational description about this image"
              }
            ]
          }
        ]
      }
    ]
  }
}

✅ Rules:
- Include 10 high-yield videos and 10 images.
- No URLs. No HTML. No commentary.
- Use clinical anatomical terminology.
- Focus on origin, course, relations, branches, termination, and imaging relevance.
- Reply only with the above JSON structure.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-1106-preview',
    temperature: 0.5,
    messages: [
      {
        role: 'system',
        content: 'You are a USMLE content generator. Reply only in valid JSON format.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return response.choices[0].message.content;
}

module.exports = async (req, res) => {
  const { topic_id, topic_title } = req.body;

  if (!topic_id || !topic_title) {
    return res.status(400).json({ error: 'topic_id and topic_title are required' });
  }

  let gptRaw = '';
  let parsed = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      gptRaw = await generateStep6(topic_title);
      console.log(`📤 GPT Raw Output [Attempt ${attempt}]:`, gptRaw);

      const cleaned = gptRaw
        .trim()
        .replace(/^```json/, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .replace(/\u200B/g, '');

      parsed = JSON.parse(cleaned);

      const step6 = parsed.content?.steps?.find((s) => s.step === 6);
      const content = step6?.content?.[0];

      if (
        step6 &&
        Array.isArray(content.videos) &&
        Array.isArray(content.images) &&
        content.videos.length === 10 &&
        content.images.length === 10 &&
        content.videos.every(v => v.keyword && v.description) &&
        content.images.every(i => i.keyword && i.description)
      ) {
        // ✅ Valid
        const finalPayload = parsed.content;
        const { data, error } = await supabase
          .from('topic_uploads')
          .insert({ topic_id, content: finalPayload })
          .select()
          .single();

        if (error) {
          console.error('❌ Supabase Insert Error:', error.message);
          return res.status(500).json({ error: 'Supabase insert failed: ' + error.message });
        }

        return res.status(200).json({ message: '✅ Step 6 content successfully generated and stored', data });
      } else {
        throw new Error('Invalid structure or missing media items');
      }
    } catch (err) {
      console.error(`❌ GPT Step 6 Error [Attempt ${attempt}]:`, err.message);
      if (attempt === 2) {
        return res.status(400).json({ error: 'Missing or invalid Step 6 structure' });
      }
    }
  }
};
