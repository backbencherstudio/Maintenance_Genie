// -----------------------------------------------------------------------------
// Payment controller for Stripe integration
// -----------------------------------------------------------------------------

import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});
const prisma = new PrismaClient();

const toCents = (n) => Math.round(Number(n) * 100);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// -----------------------------------------------------------------------------
// Create & confirm PaymentIntent (cards-only in dev; no redirect PMs)
// ----------------------------------------------------------------------------- 
export const createPaymentIntent = async (req, res) => {
  try {
    const { paymentMethodId, service_id } = req.body;
//   "paymentMethodId": "pm_card_visa",
    if (!paymentMethodId || !service_id) {
      return res.status(400).json({ error: 'Missing payment method or service ID' });
    }

    const service = await prisma.services.findUnique({ where: { id: service_id } });
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const currency = (service.currency || 'usd').toLowerCase();
    const amount = toCents(service.price);

    const { email, role, type, userId } = req.user || {};
    if (!userId) return res.status(401).json({ error: 'Unauthenticated user' });

    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user.customer_id) {
      const stripeCustomer = await stripe.customers.create({
        email: email || '',
        name: user.name || '',
      });
      user = await prisma.user.update({
        where: { id: userId },
        data: { customer_id: stripeCustomer.id },
      });
    }

    // Payment Intent parameters
    const piParams = {
      amount,
      currency,
      payment_method: paymentMethodId,
      confirm: true,
      customer: user.customer_id, 
      setup_future_usage: 'off_session',
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        user_id: userId,
        user_email: email || '',
        user_role: role || '',
        user_type: type || '',
        service_id,
        plan: service.plan || '',
      },
    };

    const uniqueId = `${userId}:${service_id}:${amount}:${currency}:${new Date().getTime()}:${Math.random().toString(36).substr(2, 9)}`;
    const idempotencyKey = sha256(uniqueId);

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(piParams, { idempotencyKey });
    } catch (err) {
      if (err?.type === 'StripeIdempotencyError') {
        const retryKey = `${idempotencyKey}-v2`;
        paymentIntent = await stripe.paymentIntents.create(piParams, { idempotencyKey: retryKey });
      } else {
        throw err;
      }
    }

    await prisma.paymentTransaction.upsert({
      where: { provider_payment_intent_id: paymentIntent.id },
      update: {
        status: paymentIntent.status || 'pending',
        updated_at: new Date(),
        payment_method: paymentIntent.payment_method || null,
        provider_payment_method_id: paymentIntent.payment_method || null,
        price: service.price,
        currency,
        provider: 'stripe',
      },
      create: {
        status: paymentIntent.status || 'pending',
        provider: 'stripe',
        provider_payment_intent_id: paymentIntent.id,
        provider_payment_method_id: paymentIntent.payment_method || null,
        user: { connect: { id: userId } },
        price: service.price,
        currency,
        payment_method: paymentIntent.payment_method || null,
      },
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      nextAction: paymentIntent.next_action || null,
    });

  } catch (error) {
    console.error('createPaymentIntent error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// -----------------------------------------------------------------------------
// Webhook handler (ensure raw body middleware only on this route)
// -----------------------------------------------------------------------------
export const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.created':
        break;

      case 'payment_intent.processing':
      case 'payment_intent.requires_action':
        await onUpdateGeneric(event.data.object);
        break;

      case 'payment_intent.succeeded':
        await onSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await onFailedOrCanceled(event.data.object);
        break;

      default:
        break;
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }

  res.json({ received: true });
};

// -----------------------------------------------------------------------------
// Generic status updater (processing / requires_action)
// -----------------------------------------------------------------------------
async function onUpdateGeneric(intent) {
  const { id: piId, status } = intent;
  if (!piId) return;

  await prisma.paymentTransaction.updateMany({
    where: { provider_payment_intent_id: piId },
    data: { status, updated_at: new Date() },
  });
}

// -----------------------------------------------------------------------------
// Success path: update tx by PI id, then user & subscription (idempotent)
// -----------------------------------------------------------------------------
async function onSucceeded(intent) {
  console.log('Processing succeeded payment for PaymentIntent:', intent);

  const { id: piId, amount_received, currency, latest_charge, metadata } = intent;
  const { user_id, service_id, plan } = metadata || {};
  if (!piId || !user_id) {
    console.log('Invalid PaymentIntent data:', intent);
    return;
  }

  console.log('Valid PaymentIntent data, proceeding with subscription creation...');

  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.update({
      where: { provider_payment_intent_id: piId },
      data: {
        status: 'succeeded',
        paid_amount: Number(amount_received) / 100,
        paid_currency: currency,
        provider_charge_id: latest_charge || null,
        provider: 'stripe',
        updated_at: new Date(),
      },
    });

    const user = await tx.user.update({
      where: { id: user_id },
      data: { role: 'premium', is_subscribed: true },
      select: { name: true },
    });

    const existingSubscription = await tx.subscription.findFirst({
      where: { user_id, service_id, status: 'Active' },
    });

    let subscriptionId;
    if (existingSubscription) {
      subscriptionId = existingSubscription.id;
      const purchasesCount = await prisma.paymentTransaction.count({
        where: {
          user_id: user_id,
          subscription: {
            service_id: service_id, 
          },
          status: 'succeeded',
        },
      });

      console.log('Number of purchases:', purchasesCount);
      const planDurationMapping = {
        'HalfYearly': 6, 
        'Yearly': 12,
      };

      const selectedPlan = plan || existingSubscription.plan || 'Yearly'; 
      const planDurationInMonths = planDurationMapping[selectedPlan] || 12;

      const newEndDate = new Date(existingSubscription.end_date);
      newEndDate.setMonth(newEndDate.getMonth() + planDurationInMonths * purchasesCount); 

      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { end_date: newEndDate },
      });

    } else {
      const service = await tx.services.findUnique({ where: { id: service_id } });
      if (!service) throw new Error('Service missing during succeeded webhook');

      const startDate = new Date();
      const endDate = calculateSubscriptionEndDate(startDate, plan || service.plan || 'Yearly');

      const newSubscription = await tx.subscription.create({
        data: {
          service_id,
          user_id,
          username: user.name,
          plan: plan || service.plan,
          start_date: startDate,
          end_date: endDate,
          price: service.price,
        },
      });
      subscriptionId = newSubscription.id;
    }

    await tx.paymentTransaction.update({
      where: { provider_payment_intent_id: piId },
      data: { subscription_id: subscriptionId },
    });
  });

  console.log('Subscription creation or update completed successfully.');
}


// -----------------------------------------------------------------------------
// Failure / canceled path
// -----------------------------------------------------------------------------
async function onFailedOrCanceled(intent) {
  const { id: piId, status } = intent;
  if (!piId) return;

  await prisma.paymentTransaction.updateMany({
    where: { provider_payment_intent_id: piId },
    data: {
      status: status === 'canceled' ? 'canceled' : 'failed',
      updated_at: new Date(),
    },
  });
}

// -----------------------------------------------------------------------------
// Utility: subscription end date from plan
// -----------------------------------------------------------------------------
function calculateSubscriptionEndDate(startDate, plan) {
  const end = new Date(startDate);
  if (plan === 'HalfYearly') end.setMonth(end.getMonth() + 6);
  else end.setFullYear(end.getFullYear() + 1);
  return end;
}