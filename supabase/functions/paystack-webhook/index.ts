// Edge Function: paystack-webhook.
// Paystack calls this address when a payment succeeds, even if the buyer
// closed the page before coming back to the app, and when a refund is
// processed or fails. The signature proves the
// call came from Paystack; anything unsigned is refused.
//
// Secret: PAYSTACK_SECRET_KEY.
// Turn "Verify JWT" OFF for this function (Paystack cannot sign in), and put
// its address in Paystack under Settings, API Keys & Webhooks, Webhook URL:
//   https://tylodszndhehbiedlqjp.supabase.co/functions/v1/paystack-webhook

import { withSupabase } from 'npm:@supabase/server@^1';
import { PAYSTACK_API, verifySignature, paidOrderFrom, refundResultFrom } from './paystack.js';

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
    const raw = await req.text();
    const signed = await verifySignature(raw, req.headers.get('x-paystack-signature'), Deno.env.get('PAYSTACK_SECRET_KEY') ?? '');
    if (!signed) return new Response('invalid signature', { status: 401 });

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return new Response('bad body', { status: 400 });
    }
    // The reference is a ticket order or a boost; the database works out which.
    if (event.event === 'charge.success') {
      const paid = paidOrderFrom(event.data);
      if (paid) {
        const { data: result, error } = await ctx.supabaseAdmin.rpc('fulfill_payment', { p_reference: paid.orderId, p_amount_cents: paid.amountCents });
        // Answer with an error so Paystack tries again later.
        if (error) return new Response('could not record payment', { status: 500 });
        if (result === 'paid_but_cancelled') {
          // Paid after the Host cancelled the event: pay it all back.
          const response = await fetch(`${PAYSTACK_API}/refund`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY') ?? ''}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: paid.orderId, amount: paid.amountCents }),
          }).catch(() => null);
          if (!response?.ok) await ctx.supabaseAdmin.rpc('record_refund', { p_order_id: paid.orderId, p_result: 'failed' });
        }
      }
    }
    // A refund finished (or failed) at Paystack.
    const refund = refundResultFrom(event);
    if (refund) {
      const { error } = await ctx.supabaseAdmin.rpc('record_refund', { p_order_id: refund.orderId, p_result: refund.result });
      if (error) return new Response('could not record refund', { status: 500 });
    }
    return new Response('ok');
  }),
};
