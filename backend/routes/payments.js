// routes/payments.js — Stripe Subscription Payments

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { protect } = require('../middleware/auth');
const User = require('../models/User');

// ─────────────────────────────────────────
// POST /api/payments/create-checkout
// Create Stripe checkout session
// ─────────────────────────────────────────
router.post('/create-checkout', protect, async (req, res) => {
  try {
    const { plan, billing } = req.body; // plan: 'pro' | 'agency', billing: 'monthly' | 'annual'
    const user = await User.findById(req.user._id);

    // Map plan to Stripe Price ID
    const priceMap = {
      pro_monthly:    process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      pro_annual:     process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
      agency_monthly: process.env.STRIPE_AGENCY_MONTHLY_PRICE_ID,
      agency_annual:  process.env.STRIPE_AGENCY_ANNUAL_PRICE_ID
    };

    const priceKey = `${plan}_${billing === 'annual' ? 'annual' : 'monthly'}`;
    const priceId  = priceMap[priceKey];

    if (!priceId) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected.' });
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name:  user.name,
        metadata: { userId: user._id.toString() }
      });
      customerId = customer.id;
      await User.findByIdAndUpdate(req.user._id, { stripeCustomerId: customerId });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode:                 'subscription',
      success_url: `${process.env.FRONTEND_URL}/dashboard.html?payment=success&plan=${plan}`,
      cancel_url:  `${process.env.FRONTEND_URL}/pricing.html?payment=cancelled`,
      metadata: { userId: user._id.toString(), plan }
    });

    res.json({ success: true, checkoutUrl: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ success: false, message: 'Payment session creation failed.' });
  }
});

// ─────────────────────────────────────────
// POST /api/payments/cancel  (protected)
// Cancel subscription
// ─────────────────────────────────────────
router.post('/cancel', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ success: false, message: 'No active subscription found.' });
    }

    // Cancel at period end (user keeps access until end of billing period)
    const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    await User.findByIdAndUpdate(req.user._id, {
      subscriptionStatus: 'canceled',
      subscriptionEndsAt: new Date(subscription.current_period_end * 1000)
    });

    res.json({
      success: true,
      message: 'Subscription cancelled. You keep access until end of billing period.',
      endsAt: new Date(subscription.current_period_end * 1000)
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ success: false, message: 'Could not cancel subscription.' });
  }
});

// ─────────────────────────────────────────
// GET /api/payments/subscription  (protected)
// Get current subscription details
// ─────────────────────────────────────────
router.get('/subscription', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.stripeSubscriptionId) {
      return res.json({
        success: true,
        subscription: null,
        plan: 'free'
      });
    }

    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

    res.json({
      success: true,
      plan:   user.plan,
      subscription: {
        status:           subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not fetch subscription.' });
  }
});

// ─────────────────────────────────────────
// POST /api/payments/webhook
// Stripe webhook — handles payment events automatically
// ─────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      // ✅ Payment succeeded — upgrade user plan
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId  = session.metadata.userId;
        const plan    = session.metadata.plan;

        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription);

        await User.findByIdAndUpdate(userId, {
          plan,
          stripeSubscriptionId: session.subscription,
          subscriptionStatus:   'active',
          subscriptionEndsAt:   new Date(subscription.current_period_end * 1000)
        });

        console.log(`✅ User ${userId} upgraded to ${plan}`);
        break;
      }

      // ✅ Subscription renewed
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const customer     = await stripe.customers.retrieve(invoice.customer);
          const user         = await User.findOne({ stripeCustomerId: customer.id });

          if (user) {
            await User.findByIdAndUpdate(user._id, {
              subscriptionStatus: 'active',
              subscriptionEndsAt: new Date(subscription.current_period_end * 1000)
            });
          }
        }
        break;
      }

      // ❌ Payment failed — notify user
      case 'invoice.payment_failed': {
        const invoice  = event.data.object;
        const customer = await stripe.customers.retrieve(invoice.customer);
        const user     = await User.findOne({ stripeCustomerId: customer.id });

        if (user) {
          await User.findByIdAndUpdate(user._id, { subscriptionStatus: 'past_due' });
          console.log(`⚠️ Payment failed for user ${user.email}`);
        }
        break;
      }

      // ❌ Subscription cancelled — downgrade to free
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customer     = await stripe.customers.retrieve(subscription.customer);
        const user         = await User.findOne({ stripeCustomerId: customer.id });

        if (user) {
          await User.findByIdAndUpdate(user._id, {
            plan:                 'free',
            stripeSubscriptionId: null,
            subscriptionStatus:   null,
            subscriptionEndsAt:   null
          });
          console.log(`📉 User ${user.email} downgraded to free`);
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed.' });
  }
});

module.exports = router;
