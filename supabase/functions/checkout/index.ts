// Edge Function: checkout.
// Called from the app by a signed-in person.
//   { action: 'start', event_id, items: [{ ticket_type_id, quantity }] }
//     Starts the order (prices and stock are checked in the database) and,
//     unless it is free, asks Paystack for a payment page to send them to.
//   { action: 'demo_pay', order_id }
//     Demo mode only: marks the person's own order paid and issues the tickets.
//   { action: 'boost_start', event_id, days }   (hosts: boost a clip for 1, 3 or 7 days)
//   { action: 'boost_demo_pay', boost_id }      (demo mode only)
//   { action: 'boost_verify', boost_id }
//     The same three steps for a paid boost of the host's own event.
//   { action: 'verify', order_id }
//     After paying, asks Paystack whether the payment went through and, if so,
//     issues the tickets. Safe to call more than once.
//
// Secrets: PAYSTACK_SECRET_KEY (sk_test_... while testing), APP_URL.
// Demo payments (no real money): leave PAYSTACK_SECRET_KEY out and set
// PAYMENTS_MODE = demo. Remove PAYMENTS_MODE before going live.
// Keep "Verify JWT" on for this function: only signed-in people may call it.

import { withSupabase } from 'npm:@supabase/server@^1';
import { PAYSTACK_API, isOrderId, paidOrderFrom, paymentMode, returnUrl } from './paystack.js';

const env = (name) => Deno.env.get(name) ?? '';
const fail = (message, status = 400) => Response.json({ error: message }, { status });

async function paystack(path, init = {}) {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status !== true) throw new Error(body.message || `Paystack answered ${response.status}`);
  return body.data;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const mode = paymentMode(env);
    if (mode === 'off') return fail('payments_not_set_up', 503);
    let body;
    try {
      body = await req.json();
    } catch {
      return fail('bad_request');
    }

    if (body.action === 'start') {
      // Runs as the signed-in person, so the database knows who is buying.
      const { data, error } = await ctx.supabase.rpc('start_order', { p_event_id: body.event_id, p_items: body.items });
      if (error) return fail(error.message);
      const order = Array.isArray(data) ? data[0] : data;
      if (order.status === 'paid') return Response.json({ order_id: order.order_id, status: 'paid' });
      if (mode === 'demo') return Response.json({ order_id: order.order_id, status: 'pending', demo: true });

      const email = ctx.userClaims?.email;
      if (!email) return fail('no_email');
      try {
        const payment = await paystack('/transaction/initialize', {
          method: 'POST',
          body: JSON.stringify({
            email,
            amount: order.total_cents,
            currency: 'ZAR',
            reference: order.order_id,
            callback_url: returnUrl(env('APP_URL'), order.order_id),
            metadata: { order_id: order.order_id },
          }),
        });
        return Response.json({ order_id: order.order_id, status: 'pending', authorization_url: payment.authorization_url });
      } catch (problem) {
        return fail(`payment_start_failed: ${problem.message}`, 502);
      }
    }

    if (body.action === 'verify' || body.action === 'demo_pay') {
      if (!isOrderId(body.order_id)) return fail('bad_request');
      // Read through the person's own access, so nobody can check or pay someone else's order.
      const { data: order } = await ctx.supabase.from('orders').select('id, status, total_cents').eq('id', body.order_id).maybeSingle();
      if (!order) return fail('unknown_order', 404);
      if (order.status !== 'pending') return Response.json({ status: order.status });

      if (mode === 'demo') {
        if (body.action === 'verify') return Response.json({ status: 'pending', demo: true });
        const { data: result, error } = await ctx.supabaseAdmin.rpc('fulfill_order', { p_order_id: order.id, p_amount_cents: order.total_cents });
        if (error) return fail(error.message, 500);
        return Response.json({ status: result === 'paid' || result === 'already_paid' ? 'paid' : 'pending', detail: result, demo: true });
      }
      if (body.action === 'demo_pay') return fail('bad_request');
      try {
        const paid = paidOrderFrom(await paystack(`/transaction/verify/${encodeURIComponent(order.id)}`));
        if (!paid || paid.orderId !== order.id) return Response.json({ status: 'pending' });
        const { data: result, error } = await ctx.supabaseAdmin.rpc('fulfill_order', { p_order_id: order.id, p_amount_cents: paid.amountCents });
        if (error) return fail(error.message, 500);
        return Response.json({ status: result === 'paid' || result === 'already_paid' ? 'paid' : 'pending', detail: result });
      } catch {
        // Paystack does not know the payment yet (for example, the person closed the page).
        return Response.json({ status: 'pending' });
      }
    }

    if (body.action === 'boost_start') {
      // Runs as the signed-in host; the database checks the event is theirs and sets the price.
      const { data, error } = await ctx.supabase.rpc('start_boost', { p_event_id: body.event_id, p_days: body.days });
      if (error) return fail(error.message);
      const boost = Array.isArray(data) ? data[0] : data;
      if (mode === 'demo') return Response.json({ boost_id: boost.boost_id, amount_cents: boost.amount_cents, status: 'pending', demo: true });
      const email = ctx.userClaims?.email;
      if (!email) return fail('no_email');
      try {
        const payment = await paystack('/transaction/initialize', {
          method: 'POST',
          body: JSON.stringify({
            email,
            amount: boost.amount_cents,
            currency: 'ZAR',
            reference: boost.boost_id,
            callback_url: returnUrl(env('APP_URL'), boost.boost_id, 'boost'),
            metadata: { boost_id: boost.boost_id },
          }),
        });
        return Response.json({ boost_id: boost.boost_id, amount_cents: boost.amount_cents, status: 'pending', authorization_url: payment.authorization_url });
      } catch (problem) {
        return fail(`payment_start_failed: ${problem.message}`, 502);
      }
    }

    if (body.action === 'boost_verify' || body.action === 'boost_demo_pay') {
      if (!isOrderId(body.boost_id)) return fail('bad_request');
      // Read through the host's own access, so nobody can pay or check someone else's boost.
      const { data: boost } = await ctx.supabase.from('boosts').select('id, status, amount_cents, ends_at').eq('id', body.boost_id).maybeSingle();
      if (!boost) return fail('unknown_boost', 404);
      if (boost.status !== 'pending') return Response.json({ status: boost.status, ends_at: boost.ends_at });
      let amount;
      if (mode === 'demo') {
        if (body.action === 'boost_verify') return Response.json({ status: 'pending', demo: true });
        amount = boost.amount_cents;
      } else {
        if (body.action === 'boost_demo_pay') return fail('bad_request');
        try {
          const paid = paidOrderFrom(await paystack(`/transaction/verify/${encodeURIComponent(boost.id)}`));
          if (!paid || paid.orderId !== boost.id) return Response.json({ status: 'pending' });
          amount = paid.amountCents;
        } catch {
          return Response.json({ status: 'pending' });
        }
      }
      const { data: result, error } = await ctx.supabaseAdmin.rpc('fulfill_boost', { p_boost_id: boost.id, p_amount_cents: amount });
      if (error) return fail(error.message, 500);
      const done = result === 'paid' || result === 'already_paid';
      const { data: after } = await ctx.supabase.from('boosts').select('ends_at').eq('id', boost.id).maybeSingle();
      return Response.json({ status: done ? 'paid' : 'pending', detail: result, ends_at: after?.ends_at ?? null, ...(mode === 'demo' ? { demo: true } : {}) });
    }

    return fail('bad_request');
  }),
};
