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

  const topic = await supabase.from('topics').select('id').eq('id', topicId).single();
  if (!topic.data) return res.status(404).json({ error: 'Topic not found' });

  const { data, error } = await supabase
    .from('topic_uploads')
    .insert({ topic_id: topicId, content })
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

  res.json(data);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Swagger docs at http://localhost:${PORT}/api-docs`);
});
