// Edge Function: checkout.
// Called from the app by a signed-in person.
//   { action: 'start', event_id, items: [{ ticket_type_id, quantity }] }
//     Starts the order (prices and stock are checked in the database) and,
//     unless it is free, asks Paystack for a payment page to send them to.
//   { action: 'verify', order_id }
//     After paying, asks Paystack whether the payment went through and, if so,
//     issues the tickets. Safe to call more than once.
//
// Secrets: PAYSTACK_SECRET_KEY (sk_test_... while testing), APP_URL.
// Keep "Verify JWT" on for this function: only signed-in people may call it.

import { withSupabase } from 'npm:@supabase/server@^1';
import { PAYSTACK_API, isOrderId, paidOrderFrom, returnUrl } from './paystack.js';

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
    if (!env('PAYSTACK_SECRET_KEY')) return fail('payments_not_set_up', 503);
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

    if (body.action === 'verify') {
      if (!isOrderId(body.order_id)) return fail('bad_request');
      // Read through the person's own access, so nobody can check someone else's order.
      const { data: order } = await ctx.supabase.from('orders').select('id, status, total_cents').eq('id', body.order_id).maybeSingle();
      if (!order) return fail('unknown_order', 404);
      if (order.status !== 'pending') return Response.json({ status: order.status });
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

    return fail('bad_request');
  }),
};
