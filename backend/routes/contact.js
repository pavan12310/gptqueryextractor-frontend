// routes/contact.js — Contact Form with Email Sending

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const Contact = require('../models/Contact');

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// ─────────────────────────────────────────
// POST /api/contact
// Submit contact form + send email
// ─────────────────────────────────────────
router.post('/', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('message').trim().isLength({ min: 10 }).withMessage('Message must be at least 10 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { firstName, lastName, email, subject, message } = req.body;

  try {
    // Save to database
    const contact = await Contact.create({ firstName, lastName, email, subject, message });

    // Send notification email to admin
    const transporter = createTransporter();

    await transporter.sendMail({
      from:    process.env.EMAIL_FROM,
      to:      process.env.CONTACT_RECEIVER,
      subject: `[GPT Query Extractor] New Contact: ${subject || 'General Question'}`,
      html: `
        <div style="font-family:monospace;background:#050a08;color:#e0ede7;padding:32px;border-radius:8px;border:1px solid rgba(0,194,122,0.3)">
          <h2 style="color:#00c27a;margin-bottom:24px">📬 New Contact Form Submission</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#7aaa90;padding:8px 0;width:120px">Name:</td><td style="color:#e0ede7">${firstName} ${lastName}</td></tr>
            <tr><td style="color:#7aaa90;padding:8px 0">Email:</td><td><a href="mailto:${email}" style="color:#00c27a">${email}</a></td></tr>
            <tr><td style="color:#7aaa90;padding:8px 0">Subject:</td><td style="color:#e0ede7">${subject || 'General Question'}</td></tr>
            <tr><td style="color:#7aaa90;padding:8px 0;vertical-align:top">Message:</td><td style="color:#e0ede7;line-height:1.8">${message.replace(/\n/g, '<br>')}</td></tr>
          </table>
          <hr style="border-color:rgba(0,194,122,0.2);margin:24px 0">
          <p style="color:#3d6352;font-size:12px">Submitted at: ${new Date().toLocaleString()} · ID: ${contact._id}</p>
        </div>
      `
    });

    // Send confirmation email to user
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM,
      to:      email,
      subject: 'We received your message — GPT Query Extractor',
      html: `
        <div style="font-family:monospace;background:#050a08;color:#e0ede7;padding:32px;border-radius:8px;border:1px solid rgba(0,194,122,0.3)">
          <h2 style="color:#00c27a">Thanks, ${firstName}! ✓</h2>
          <p style="color:#7aaa90;line-height:1.8;margin:16px 0">We received your message and will get back to you within 24 hours on business days.</p>
          <div style="background:#0a1410;border:1px solid rgba(0,194,122,0.15);border-radius:6px;padding:16px;margin:24px 0">
            <p style="color:#3d6352;font-size:11px;margin-bottom:8px">YOUR MESSAGE</p>
            <p style="color:#7aaa90;line-height:1.8">${message.replace(/\n/g, '<br>')}</p>
          </div>
          <p style="color:#3d6352;font-size:12px">— GPT Query Extractor Team</p>
        </div>
      `
    });

    res.status(201).json({
      success: true,
      message: 'Message sent! We will reply within 24 hours.'
    });

  } catch (error) {
    console.error('Contact form error:', error);
    // Still save to DB even if email fails
    res.status(500).json({
      success: false,
      message: 'Message saved but email failed. We will still get back to you.'
    });
  }
});

module.exports = router;
