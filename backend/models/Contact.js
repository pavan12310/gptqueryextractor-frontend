// models/Contact.js — Contact Form Submission Schema

const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, required: true, trim: true },
  email:      { type: String, required: true, lowercase: true },
  subject: {
    type: String,
    enum: ['General Question', 'Bug Report', 'Feature Request', 'Agency / Sales', 'Other'],
    default: 'General Question'
  },
  message:    { type: String, required: true },
  status: {
    type: String,
    enum: ['new', 'read', 'replied'],
    default: 'new'
  },
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Contact', ContactSchema);
