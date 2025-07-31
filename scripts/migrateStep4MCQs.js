const { supabase } = require('../utils/supabaseClient');
const { v4: uuidv4 } = require('uuid');

async function migrateStep4MCQs() {
  try {
    const { data: uploads, error } = await supabase
      .from('topic_uploads')
      .select('id, topic_id, content')
      .not('content', 'is', null);

    if (error) throw error;

    let totalInserted = 0;

    for (const upload of uploads) {
      const step4 = upload.content?.steps?.find((s) => s.step === 4);

      if (!step4 || !Array.isArray(step4.content)) continue;

      for (const message of step4.content) {
        const mcqRegex = /<mcq>(.*?)<\/mcq>/gs;
        let match;

        while ((match = mcqRegex.exec(message.html))) {
          try {
            const rawJson = match[1].trim();
            const mcq = JSON.parse(rawJson);

            const { stem, options, correct_answer } = mcq;
            if (!stem || !options || !correct_answer) continue;

            const { error: insertError } = await supabase
              .from('mcqs')
              .insert({
                id: uuidv4(),
                topic_id: upload.topic_id,
                step: 4,
                stem,
                options,
                correct_answer,
              });

            if (!insertError) totalInserted++;
          } catch (err) {
            console.warn('❌ Invalid JSON in <mcq>: ', err.message);
          }
        }
      }
    }

    console.log(`✅ Migration complete. Total MCQs inserted: ${totalInserted}`);
  } catch (err) {
    console.error('❌ Migration error:', err.message || err);
  }
}

migrateStep4MCQs();
