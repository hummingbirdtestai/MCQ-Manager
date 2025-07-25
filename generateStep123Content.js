const { openai } = require('./utils/openaiClient'); // Adjust path if needed
const { supabase } = require('./utils/supabaseClient'); // Adjust path if needed

module.exports = async function generateStep123Content(req, res) {
  const { topic_id, topic_title } = req.body;
  if (!topic_id || !topic_title) {
    return res.status(400).json({ error: 'topic_id and topic_title are required' });
  }

  try {
    const prompt = `🔷 PROMPT TO GENERATE USMLE-LEVEL CONTENT FOR STEP 1, STEP 2, STEP 3

You are an expert USMLE medical educator and structured data content developer.
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
Simulate a detailed 30-message conversation between a teacher 👨‍🏫 and student 🧑‍🎓 on this topic.
Alternate between teacher and student.
Each message:
{
  "sender": "teacher" or "student",
  "html": "<div>👨‍🏫 or 🧑‍🎓 <strong>Keyword</strong> <i>explanation</i> with emoji anchors</div>"
}
Teacher leads discussion; student confirms or summarizes.
Focus on clinical clarity, USMLE reasoning, memory anchors.

🔷 STEP 2: BUZZWORD ACTIVE RECALL TABLE
Create a 10-row table:
Columns:
buzzword: use <strong> and an emoji
highYieldPoint: short, precise clinical fact for rapid review.

🔷 STEP 3: REMEDIATION BOOSTER TABLE
Create 30 unique rows (different from Step 2):
Columns:
buzzword: use <strong> and emoji
clarifyingFact: detailed clarifying fact for clinical reinforcement.

🔷 OUTPUT FORMAT (MANDATORY):
Return exactly this structure as one valid JSON object:
{
  "steps": [
    { "step": 1, "content": [...] },
    { "step": 2, "content": [...] },
    { "step": 3, "content": [...] }
  ]
}
🚨 STRICT INSTRUCTIONS:
JSON only.
No headings.
No commentary.
No markdown.
No HTML files.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [
        { role: 'system', content: 'You are a USMLE content generator' },
        { role: 'user', content: prompt }
      ]
    });

    const jsonContent = JSON.parse(completion.choices[0].message.content);

    const { data, error } = await supabase
      .from('topic_uploads')
      .insert({ topic_id, content: jsonContent })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ message: 'Content saved to Supabase', data });
  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: 'Failed to generate content' });
  }
};
