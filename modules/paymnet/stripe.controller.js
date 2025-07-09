import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { PrismaClient } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient();

export const createPaymentIntent = async (req, res) => {
  try {
    const { paymentMethodId, currency, service_id } = req.body;
    if (!paymentMethodId || !currency || !service_id) {
      return res.status(400).json({ error: 'Missing payment method, currency, or service ID' });
    }

    const service = await prisma.services.findUnique({
      where: { id: service_id },
    });

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const { email, role, type, userId } = req.user || {};
    console.log('User Info:', { email, role, type, userId });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(service.price * 100),
      currency,
      payment_method: paymentMethodId,
      metadata: {
        user_id: userId,
        user_email: email,
        user_role: role,
        user_type: type,
        service_id,
        plan: service.plan,
      }
    });

    console.log('Payment Intent Created:', paymentIntent.client_secret);
    console.log('Payment Intent Metadata:', paymentIntent.metadata);

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
    });

  } catch (error) {
    console.error('Payment Intent Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  console.log(`Received event type: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object);
      break;

    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
      break;
  }

  // Send acknowledgment back to Stripe
  res.json({ received: true });
};

// Handle successful payment intent
const handlePaymentIntentSucceeded = async (paymentIntent) => {
  const { user_id, service_id, plan } = paymentIntent.metadata;

  if (!user_id) {
    console.error('User ID not found in payment intent metadata.');
    return;
  }

  try {
    await prisma.user.update({
      where: { id: user_id },
      data: {
        role: "premium",
        is_subscribed: 1,
      },
    });

    console.log(`User ${user_id}'s role updated to "premium".`);

    const service = await prisma.services.findUnique({
      where: { id: service_id },
    });

    if (!service) {
      console.error('Service not found for subscription.');
      return;
    }

    const startDate = new Date();
    const endDate = calculateSubscriptionEndDate(startDate, plan);

    const subscription = await prisma.subscription.create({
      data: {
        service_id: service_id,
        user_id: user_id,
        plan: plan,
        start_date: startDate,
        end_date: endDate,
        status: "premium",
        price: service.price,
      },
    });

    console.log(`Subscription created for user ${user_id} with plan ${plan}.`);

    const paymentTransaction = await prisma.paymentTransaction.create({
      data: {
        user: { connect: { id: user_id } },
        price: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        payment_method: paymentIntent.payment_method,
        subscription: { connect: { id: subscription.id } },
      },
    });

    console.log(`Payment transaction created for user ${user_id}:`, paymentTransaction);

  } catch (error) {
    console.error(`Error processing payment intent for user ${user_id}:`, error);
  }
};

const handlePaymentIntentFailed = async (paymentIntent) => {
  const { user_id } = paymentIntent.metadata;

  if (!user_id) {
    console.error('User ID not found in payment intent metadata.');
    return;
  }

  console.warn(`Payment for user ${user_id} failed with status: ${paymentIntent.status}`);
};

const calculateSubscriptionEndDate = (startDate, plan) => {
  const endDate = new Date(startDate);

  if (plan === "HalfYearly") {
    endDate.setMonth(startDate.getMonth() + 6);
  } else {
    endDate.setFullYear(startDate.getFullYear() + 1);
  }

  return endDate;
};
