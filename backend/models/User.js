// models/User.js — User Schema

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },
  password: {
    type: String,
    minlength: [8, 'Password must be at least 8 characters'],
    select: false  // never return password in queries
  },
  googleId: {
    type: String,
    default: null
  },
  avatar: {
    type: String,
    default: null
  },

  // Plan & Subscription
  plan: {
    type: String,
    enum: ['free', 'pro', 'agency'],
    default: 'free'
  },
  stripeCustomerId: {
    type: String,
    default: null
  },
  stripeSubscriptionId: {
    type: String,
    default: null
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'canceled', 'past_due', 'trialing', null],
    default: null
  },
  subscriptionEndsAt: {
    type: Date,
    default: null
  },

  // Stats
  totalSessionsRun: { type: Number, default: 0 },
  totalPromptsRun:  { type: Number, default: 0 },
  totalQueriesCaptured: { type: Number, default: 0 },
  totalExports: { type: Number, default: 0 },

  // Settings
  settings: {
    notifications: { type: Boolean, default: true },
    autoSave:       { type: Boolean, default: true },
    autoNewChat:    { type: Boolean, default: true },
    darkMode:       { type: Boolean, default: true },
    compactMode:    { type: Boolean, default: false },
    defaultDelay:   { type: Number, default: 30 }
  },

  // Auth
  isEmailVerified: { type: Boolean, default: false },
  resetPasswordToken:   String,
  resetPasswordExpire:  Date,
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now }
});

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
