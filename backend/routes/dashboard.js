// routes/dashboard.js — Dashboard Stats & Data

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Session = require('../models/Session');
const User = require('../models/User');

// ─────────────────────────────────────────
// GET /api/dashboard/stats  (protected)
// Get user's overview stats
// ─────────────────────────────────────────
router.get('/stats', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Sessions this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const sessionsThisWeek = await Session.countDocuments({
      user: req.user._id,
      createdAt: { $gte: oneWeekAgo }
    });

    // Queries per day (last 7 days) for chart
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const queryChart = await Session.aggregate([
      {
        $match: {
          user: req.user._id,
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          totalQueries: { $sum: '$totalQueries' },
          totalPrompts: { $sum: '$totalPrompts' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Build 7-day chart data (fill missing days with 0)
    const chartData = [];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const found = queryChart.find(q => q._id === key);
      chartData.push({
        day:   days[d.getDay() === 0 ? 6 : d.getDay() - 1],
        date:  key,
        queries: found ? found.totalQueries : 0,
        prompts: found ? found.totalPrompts : 0
      });
    }

    res.json({
      success: true,
      stats: {
        totalSessions:        user.totalSessionsRun,
        totalPrompts:         user.totalPromptsRun,
        totalQueries:         user.totalQueriesCaptured,
        totalExports:         user.totalExports,
        sessionsThisWeek,
        plan:                 user.plan
      },
      chartData
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Could not fetch stats.' });
  }
});

// ─────────────────────────────────────────
// GET /api/dashboard/recent  (protected)
// Get recent sessions (last 10)
// ─────────────────────────────────────────
router.get('/recent', protect, async (req, res) => {
  try {
    const sessions = await Session.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name status totalPrompts completedPrompts totalQueries createdAt completedAt');

    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not fetch recent sessions.' });
  }
});

module.exports = router;
