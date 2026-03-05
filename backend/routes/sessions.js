// routes/sessions.js — Session History Storage & Management

const express = require('express');
const router = express.Router();
const { protect, requirePlan } = require('../middleware/auth');
const Session = require('../models/Session');
const User = require('../models/User');

// ─────────────────────────────────────────
// GET /api/sessions  (protected)
// Get all sessions for user (paginated)
// ─────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    // Free plan: max 5 sessions history
    const user = await User.findById(req.user._id);
    const maxHistory = user.plan === 'free' ? 5 : 9999;

    const sessions = await Session.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(limit, maxHistory))
      .select('name status totalPrompts completedPrompts totalQueries createdAt completedAt exports');

    const total = await Session.countDocuments({ user: req.user._id });

    res.json({
      success: true,
      sessions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      planLimit: user.plan === 'free' ? 5 : null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not fetch sessions.' });
  }
});

// ─────────────────────────────────────────
// GET /api/sessions/:id  (protected)
// Get single session with all prompts + queries
// ─────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not fetch session.' });
  }
});

// ─────────────────────────────────────────
// POST /api/sessions  (protected)
// Create a new session
// ─────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { name, prompts, delaySeconds } = req.body;
    const user = await User.findById(req.user._id);

    // Free plan: max 50 prompts per session
    if (user.plan === 'free' && prompts && prompts.length > 50) {
      return res.status(403).json({
        success: false,
        message: 'Free plan is limited to 50 prompts per session. Upgrade to Pro for unlimited prompts.'
      });
    }

    // Build prompt results array
    const promptResults = (prompts || []).map((text, idx) => ({
      promptText: text,
      promptIndex: idx,
      queries: [],
      status: 'pending'
    }));

    const session = await Session.create({
      user: req.user._id,
      name: name || `Session ${new Date().toLocaleDateString()}`,
      prompts: promptResults,
      delaySeconds: delaySeconds || 30,
      status: 'running'
    });

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { totalSessionsRun: 1 }
    });

    res.status(201).json({ success: true, message: 'Session created!', session });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ success: false, message: 'Could not create session.' });
  }
});

// ─────────────────────────────────────────
// PUT /api/sessions/:id/result  (protected)
// Save result for a single prompt (add extracted queries)
// Called by the Chrome extension after each prompt
// ─────────────────────────────────────────
router.put('/:id/result', protect, async (req, res) => {
  try {
    const { promptIndex, queries } = req.body;
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    // Update the specific prompt with captured queries
    const prompt = session.prompts[promptIndex];
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Invalid prompt index.' });
    }

    prompt.queries = queries.map(q => ({ text: q }));
    prompt.status  = 'done';
    prompt.runAt   = new Date();

    await session.save();

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: {
        totalPromptsRun: 1,
        totalQueriesCaptured: queries.length
      }
    });

    res.json({
      success: true,
      message: 'Result saved!',
      progress: {
        completed: session.completedPrompts,
        total:     session.totalPrompts,
        percent:   Math.round((session.completedPrompts / session.totalPrompts) * 100)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not save result.' });
  }
});

// ─────────────────────────────────────────
// PUT /api/sessions/:id/status  (protected)
// Update session status (pause, resume, complete, stop)
// ─────────────────────────────────────────
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['running', 'paused', 'completed', 'stopped'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const update = { status };
    if (status === 'completed' || status === 'stopped') {
      update.completedAt = new Date();
    }

    const session = await Session.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      update,
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    res.json({ success: true, message: `Session ${status}`, session });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not update status.' });
  }
});

// ─────────────────────────────────────────
// POST /api/sessions/:id/export  (protected)
// Log an export (format: json | csv | txt)
// ─────────────────────────────────────────
router.post('/:id/export', protect, async (req, res) => {
  try {
    const { format } = req.body;
    const user = await User.findById(req.user._id);

    // Free plan: only json and csv
    if (user.plan === 'free' && format === 'txt') {
      return res.status(403).json({
        success: false,
        message: 'Plain text export requires Pro plan. Please upgrade.'
      });
    }

    const session = await Session.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $push: { exports: { format } } },
      { new: true }
    );

    // Update user export count
    await User.findByIdAndUpdate(req.user._id, { $inc: { totalExports: 1 } });

    // Return the data in requested format
    const allQueries = [];
    session.prompts.forEach(p => {
      p.queries.forEach(q => {
        allQueries.push({ prompt: p.promptText, query: q.text });
      });
    });

    let exportData;
    if (format === 'json') {
      exportData = JSON.stringify(
        session.prompts.map(p => ({ prompt: p.promptText, queries: p.queries.map(q => q.text) })),
        null, 2
      );
    } else if (format === 'csv') {
      exportData = 'Prompt,Query\n' + allQueries.map(r => `"${r.prompt}","${r.query}"`).join('\n');
    } else if (format === 'txt') {
      exportData = allQueries.map(r => r.query).join('\n');
    }

    res.json({ success: true, format, data: exportData });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Export failed.' });
  }
});

// ─────────────────────────────────────────
// DELETE /api/sessions/:id  (protected)
// Delete a session
// ─────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const session = await Session.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    res.json({ success: true, message: 'Session deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not delete session.' });
  }
});

// ─────────────────────────────────────────
// DELETE /api/sessions  (protected)
// Clear all sessions for user
// ─────────────────────────────────────────
router.delete('/', protect, async (req, res) => {
  try {
    await Session.deleteMany({ user: req.user._id });
    res.json({ success: true, message: 'All sessions cleared.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not clear sessions.' });
  }
});

module.exports = router;
