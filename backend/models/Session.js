// models/Session.js — Query Session Schema

const mongoose = require('mongoose');

// Individual query extracted from ChatGPT
const QuerySchema = new mongoose.Schema({
  text:      { type: String, required: true },
  promptIdx: { type: Number }, // which prompt generated this query
  capturedAt:{ type: Date, default: Date.now }
});

// A single prompt and its extracted queries
const PromptResultSchema = new mongoose.Schema({
  promptText: { type: String, required: true },
  promptIndex: { type: Number },
  queries:    [QuerySchema],
  status: {
    type: String,
    enum: ['pending', 'running', 'done', 'error'],
    default: 'pending'
  },
  runAt: { type: Date }
});

// Full session (one run of multiple prompts)
const SessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    default: function() {
      return `Session ${new Date().toLocaleDateString()}`;
    }
  },
  status: {
    type: String,
    enum: ['running', 'paused', 'completed', 'stopped'],
    default: 'running'
  },
  prompts:      [PromptResultSchema],
  totalPrompts: { type: Number, default: 0 },
  completedPrompts: { type: Number, default: 0 },
  totalQueries: { type: Number, default: 0 },
  delaySeconds: { type: Number, default: 30 },

  // Export history
  exports: [{
    format:     { type: String, enum: ['json', 'csv', 'txt'] },
    exportedAt: { type: Date, default: Date.now }
  }],

  startedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date },
  createdAt:   { type: Date, default: Date.now }
});

// Auto-calculate totals before saving
SessionSchema.pre('save', function (next) {
  this.totalPrompts = this.prompts.length;
  this.completedPrompts = this.prompts.filter(p => p.status === 'done').length;
  this.totalQueries = this.prompts.reduce((sum, p) => sum + p.queries.length, 0);
  next();
});

module.exports = mongoose.model('Session', SessionSchema);
