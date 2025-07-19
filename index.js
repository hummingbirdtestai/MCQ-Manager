console.log('📢 index.js started');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');

const app = express();
app.use(express.json());
app.use(cors());

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Swagger setup
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MCQ Manager API',
      version: '1.0.0',
      description: 'API documentation for MCQ Manager'
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 3000}` }
    ]
  },
  apis: ['./index.js']
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /subjects:
 *   post:
 *     tags:
 *       - Subjects
 *     summary: Create subjects
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *     responses:
 *       201:
 *         description: Subjects created
 */
app.post('/subjects', async (req, res) => {
  const subjects = req.body;
  const { data, error } = await supabase.from('subjects').insert(subjects).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

/**
 * @swagger
 * /subjects:
 *   get:
 *     tags:
 *       - Subjects
 *     summary: Get all subjects
 *     responses:
 *       200:
 *         description: List of subjects
 */
app.get('/subjects', async (req, res) => {
  const { data, error } = await supabase.from('subjects').select('id, name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/**
 * @swagger
 * /subjects/{subjectId}/chapters:
 *   post:
 *     tags:
 *       - Subjects
 *     summary: Add chapters and topics to a subject
 *     parameters:
 *       - in: path
 *         name: subjectId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chapters:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     topics:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *     responses:
 *       201:
 *         description: Chapters and topics created
 */
app.post('/subjects/:subjectId/chapters', async (req, res) => {
  const { subjectId } = req.params;
  const { chapters } = req.body;

  const subject = await supabase.from('subjects').select('*').eq('id', subjectId).single();
  if (!subject.data) return res.status(404).json({ error: 'Subject not found' });

  const createdChapters = [];
  const createdTopics = [];

  for (const chapter of chapters) {
    const { data: chapterData, error: chapterError } = await supabase
      .from('chapters')
      .insert({ subject_id: subjectId, name: chapter.name })
      .select()
      .single();

    if (chapterError) return res.status(500).json({ error: chapterError.message });
    createdChapters.push(chapterData);

    if (Array.isArray(chapter.topics)) {
      for (const topic of chapter.topics) {
        const { data: topicData, error: topicError } = await supabase
          .from('topics')
          .insert({ chapter_id: chapterData.id, name: topic.name })
          .select()
          .single();

        if (topicError) return res.status(500).json({ error: topicError.message });
        createdTopics.push(topicData);
      }
    }
  }

  res.status(201).json({
    subject: { id: subject.data.id, name: subject.data.name },
    chapters: createdChapters,
    topics: createdTopics
  });
});

/**
 * @swagger
 * /subjects/{subjectId}/structure:
 *   get:
 *     tags:
 *       - Subjects
 *     summary: Get subject structure (chapters and topics)
 *     parameters:
 *       - in: path
 *         name: subjectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Subject structure
 */
app.get('/subjects/:subjectId/structure', async (req, res) => {
  const { subjectId } = req.params;

  const subject = await supabase.from('subjects').select('id, name').eq('id', subjectId).single();
  if (!subject.data) return res.status(404).json({ error: 'Subject not found' });

  const { data: chapters, error: chaptersError } = await supabase
    .from('chapters')
    .select('id, name')
    .eq('subject_id', subjectId);

  if (chaptersError) return res.status(500).json({ error: chaptersError.message });

  for (const chapter of chapters) {
    const { data: topics } = await supabase
      .from('topics')
      .select('id, name')
      .eq('chapter_id', chapter.id);

    chapter.topics = topics || [];
  }

  res.json({
    subject: { id: subject.data.id, name: subject.data.name },
    chapters
  });
});

/**
 * @swagger
 * /topics/{topicId}/uploads:
 *   post:
 *     tags:
 *       - Topics
 *     summary: Upload content for a topic
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Content uploaded
 */
app.post('/topics/:topicId/uploads', async (req, res) => {
  const { topicId } = req.params;
  const { content } = req.body;

  if (!content) return res.status(400).json({ error: 'Content is required' });

  // Try parsing the JSON content to ensure it has the correct structure
  let parsedContent;
  try {
    parsedContent = JSON.parse(content);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid JSON format' });
  }

  // Validate the parsed content structure
  if (!parsedContent.steps || !Array.isArray(parsedContent.steps) || parsedContent.steps.length === 0) {
    return res.status(400).json({ error: 'Invalid content structure, steps array is required' });
  }

  const topic = await supabase.from('topics').select('id').eq('id', topicId).single();
  if (!topic.data) return res.status(404).json({ error: 'Topic not found' });

  // Insert the parsed content as JSON into the topic_uploads table
  const { data, error } = await supabase
    .from('topic_uploads')
    .insert({
      topic_id: topicId,
      content: parsedContent, // Store as JSON
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json(data);
});

/**
 * @swagger
 * /topics/{topicId}/uploads:
 *   get:
 *     tags:
 *       - Topics
 *     summary: Get all uploads for a topic
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of uploads
 */
app.get('/topics/:topicId/uploads', async (req, res) => {
  const { topicId } = req.params;

  const topic = await supabase.from('topics').select('id').eq('id', topicId).single();
  if (!topic.data) return res.status(404).json({ error: 'Topic not found' });

  const { data, error } = await supabase
    .from('topic_uploads')
    .select('id, content, created_at')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Parse the JSON content and return the structured content by steps
  const parsedUploads = data.map(upload => ({
    ...upload,
    content: upload.content, // JSON content stored in the database
  }));

  res.json(parsedUploads);
});


/**
 * @swagger
 * /topics/{topicId}/mcqs:
 *   post:
 *     tags:
 *       - Topics
 *     summary: Upload 10 MCQs for a topic
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mcqs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     learning_gap:
 *                       type: string
 *                     stem:
 *                       type: string
 *                     options:
 *                       type: object
 *                       properties:
 *                         A:
 *                           type: string
 *                         B:
 *                           type: string
 *                         C:
 *                           type: string
 *                         D:
 *                           type: string
 *                         E:
 *                           type: string
 *                     correct_answer:
 *                       type: string
 *                     explanation:
 *                       type: string
 *     responses:
 *       201:
 *         description: MCQs uploaded successfully
 *       400:
 *         description: Must upload exactly 10 MCQs
 *       500:
 *         description: Server error
 */
app.post('/topics/:topicId/mcqs', async (req, res) => {
  const { topicId } = req.params;
  const { mcqs } = req.body;

  if (!mcqs || mcqs.length !== 10) {
    return res.status(400).json({ error: 'You must upload exactly 10 MCQs.' });
  }

  const formatted = mcqs.map((mcq) => ({
    topic_id: topicId,
    learning_gap: mcq.learning_gap,
    stem: mcq.stem,
    option_a: mcq.options.A,
    option_b: mcq.options.B,
    option_c: mcq.options.C,
    option_d: mcq.options.D,
    option_e: mcq.options.E,
    correct_answer: mcq.correct_answer,
    explanation: mcq.explanation,
  }));

  const { error } = await supabase.from('mcqs').insert(formatted);
  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({ message: 'MCQs uploaded successfully.' });
});

/**
 * @swagger
 * /topics/{topicId}/mcqs:
 *   get:
 *     tags:
 *       - Topics
 *     summary: Get MCQs for a topic
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of MCQs for the topic
 *       500:
 *         description: Server error
 */
app.get('/topics/:topicId/mcqs', async (req, res) => {
  const { topicId } = req.params;

  const { data, error } = await supabase
    .from('mcqs')
    .select('*')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
/**
 * @swagger
 * /users/register:
 *   post:
 *     tags:
 *       - Users
 *     summary: Register student
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *               photograph_url:
 *                 type: string
 *               medical_college:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered
 */
app.post('/users/register', async (req, res) => {
  const { phone, email, name, photograph_url, medical_college } = req.body;
  const { data, error } = await supabase.from('users').insert({
    phone, email, name, photograph_url, medical_college
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get user profile
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile
 */
app.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/**
 * @swagger
 * /topics/{topicId}/mcqs/start-test:
 *   post:
 *     tags:
 *       - Topics
 *     summary: Start MCQ test session
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test session started
 */
app.post('/topics/:topicId/mcqs/start-test', async (req, res) => {
  res.status(200).json({ message: 'Test session started (optional implementation).' });
});

/**
 * @swagger
 * /topics/{topicId}/mcqs/{mcqId}/submit:
 *   post:
 *     tags:
 *       - Topics
 *     summary: Submit answer for MCQ with scoring
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: mcqId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: string
 *               selected_answer:
 *                 type: string
 *                 description: A, B, C, D, E or S (Skipped)
 *     responses:
 *       200:
 *         description: Answer submitted with score
 */
app.post('/topics/:topicId/mcqs/:mcqId/submit', async (req, res) => {
  const { topicId, mcqId } = req.params;
  const { user_id, selected_answer } = req.body;

  const mcq = await supabase.from('mcqs').select('correct_answer').eq('id', mcqId).single();
  if (!mcq.data) return res.status(404).json({ error: 'MCQ not found' });

  let score = 0;
  let is_correct = false;
  if (selected_answer === mcq.data.correct_answer) {
    score = 4;
    is_correct = true;
  } else if (selected_answer === 'S') {
    score = 0;
  } else {
    score = -1;
  }

  const existing = await supabase
    .from('student_mcq_responses')
    .select('id')
    .eq('user_id', user_id)
    .eq('topic_id', topicId)
    .eq('mcq_id', mcqId)
    .single();

  if (existing.data) {
    await supabase
      .from('student_mcq_responses')
      .update({ selected_answer, is_correct, score })
      .eq('id', existing.data.id);
  } else {
    await supabase.from('student_mcq_responses').insert({
      user_id,
      topic_id: topicId,
      mcq_id: mcqId,
      selected_answer,
      is_correct,
      score
    });
  }

  res.status(200).json({ message: 'Answer submitted', score });
});
/**
 * @swagger
 * /topics/{topicId}/leaderboard:
 *   get:
 *     tags:
 *       - Topics
 *     summary: Get leaderboard for a topic
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Leaderboard for the topic
 */
app.get('/topics/:topicId/leaderboard', async (req, res) => {
  const { topicId } = req.params;
  const { data, error } = await supabase.from('student_mcq_responses').select(`
    user_id,
    users (
      name,
      photograph_url,
      medical_college
    ),
    score
  `).eq('topic_id', topicId);
  if (error) return res.status(500).json({ error: error.message });
  const leaderboard = {};
  data.forEach((row) => {
    if (!leaderboard[row.user_id]) {
      leaderboard[row.user_id] = {
        name: row.users.name,
        photograph_url: row.users.photograph_url,
        medical_college: row.users.medical_college,
        total_score: 0
      };
    }
    leaderboard[row.user_id].total_score += row.score;
  });
  const sorted = Object.values(leaderboard).sort((a, b) => b.total_score - a.total_score).slice(0, 10);
  res.json(sorted);
});
/**
 * @swagger
 * /topics/{topicId}/mcqs/{mcqId}/leaderboard-status:
 *   get:
 *     tags:
 *       - Topics
 *     summary: Get leaderboard status for user and MCQ in a topic
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: mcqId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Leaderboard and user status for the specified MCQ
 */
app.get('/topics/:topicId/mcqs/:mcqId/leaderboard-status', async (req, res) => {
  const { topicId, mcqId } = req.params;
  const { user_id } = req.query;

  const { data: allResponses, error } = await supabase
    .from('student_mcq_responses')
    .select(`
      user_id,
      mcq_id,
      score,
      selected_answer,
      is_correct,
      mcqs(correct_answer),
      users(name, photograph_url, medical_college)
    `)
    .eq('topic_id', topicId);

  if (error) return res.status(500).json({ error: error.message });

  const mcqOrder = allResponses.map(r => r.mcq_id);
  const uptoIndex = mcqOrder.indexOf(mcqId);
  if (uptoIndex === -1) return res.status(404).json({ error: 'MCQ not found in responses' });

  const userScores = {};
  allResponses.forEach(r => {
    if (!userScores[r.user_id]) {
      userScores[r.user_id] = {
        name: r.users.name,
        photo: r.users.photograph_url,
        college: r.users.medical_college,
        total_score: 0,
        specific_mcq_score: 0,
        specific_answer: null,
        specific_correct_answer: null,
        specific_correctness: null
      };
    }
    if (mcqOrder.indexOf(r.mcq_id) <= uptoIndex) {
      userScores[r.user_id].total_score += r.score;
    }
    if (r.mcq_id === mcqId) {
      userScores[r.user_id].specific_mcq_score = r.score;
      userScores[r.user_id].specific_answer = r.selected_answer;
      userScores[r.user_id].specific_correct_answer = r.mcqs.correct_answer;
      userScores[r.user_id].specific_correctness = r.is_correct;
    }
  });

  const sorted = Object.entries(userScores)
    .map(([uid, val]) => ({ user_id: uid, ...val }))
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10);

  sorted.forEach((user, idx) => user.rank = idx + 1);

  const specificUser = Object.entries(userScores).find(([uid]) => uid === user_id);
  let userRank = null;
  sorted.forEach((u, idx) => {
    if (u.user_id === user_id) userRank = idx + 1;
  });

  const userData = specificUser ? {
    user_id,
    total_score: specificUser[1].total_score,
    specific_mcq_score: specificUser[1].specific_mcq_score,
    specific_answer: specificUser[1].specific_answer,
    correct_answer: specificUser[1].specific_correct_answer,
    is_correct: specificUser[1].specific_correctness,
    rank: userRank ?? null
  } : null;

  res.json({
    leaderboard: sorted.map(u => ({
      name: u.name,
      total_score: u.total_score,
      specific_mcq_score: u.specific_mcq_score,
      rank: u.rank
    })),
    user: userData
  });
});

/**
 * @swagger
 * /learning-path:
 *   get:
 *     tags:
 *       - Subjects
 *     summary: Get full learning path (subjects → chapters → topics)
 *     responses:
 *       200:
 *         description: Full learning path structure
 */
app.get('/learning-path', async (req, res) => {
  try {
    const { data: subjects, error: subjectError } = await supabase.from('subjects').select('id, name');
    if (subjectError) throw subjectError;

    const result = await Promise.all(subjects.map(async (subject) => {
      const { data: chapters, error: chaptersError } = await supabase
        .from('chapters')
        .select('id, name')
        .eq('subject_id', subject.id);
      if (chaptersError) throw chaptersError;

      const chaptersWithTopics = await Promise.all(chapters.map(async (chapter) => {
        const { data: topics, error: topicsError } = await supabase
          .from('topics')
          .select('id, name')
          .eq('chapter_id', chapter.id);
        if (topicsError) throw topicsError;

        return {
          id: chapter.id,
          name: chapter.name,
          topics: topics || [],
        };
      }));

      return {
        id: subject.id,
        name: subject.name,
        chapters: chaptersWithTopics,
      };
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch learning path' });
  }
});

/**
 * @swagger
 * /topics/{topicId}/uploads:
 *   delete:
 *     tags:
 *       - Topics
 *     summary: Delete all uploads for a topic
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All uploads deleted for the topic
 *       404:
 *         description: Topic not found
 *       500:
 *         description: Server error
 */
app.delete('/topics/:topicId/uploads', async (req, res) => {
  const { topicId } = req.params;

  const topic = await supabase.from('topics').select('id').eq('id', topicId).single();
  if (!topic.data) return res.status(404).json({ error: 'Topic not found' });

  const { error } = await supabase.from('topic_uploads').delete().eq('topic_id', topicId);
  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ message: 'All uploads deleted for this topic' });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Swagger docs at http://localhost:${PORT}/api-docs`);
});
