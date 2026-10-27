# Trustpilot Buyback

AFS sends the configured **Microforce BuyBack** template 7 days after it receives the trigger. `done` means sale-ready/in stock, **not paid**. Payment is separately completed within 5 days. No app-side extra delay is added; Trustpilot owns the actual template and schedule.

## Preview

Only TEST receives `security/sql/trustpilot-buyback.sql`. Configuration defaults to preview. After UPDATE status → done the trigger inserts one durable row with the relevant customer snapshot. Unique lead_id prevents concurrent/repeated transitions from adding another. INSERT done, unrelated updates and historical completed leads are never backfilled. Missing name/email produces blocked instead of pretending success. Registrations use service-only RLS/ACL; admins with Leads access can inspect them at `/admin/leads/trustpilot`, regular users cannot.

`Gegevens opnieuw controleren` refreshes only an existing never-attempted registration from a currently done lead. Preview rows stay preview even if config later becomes live. The page renders the AFS snippet as escaped text; it does not execute it. Preview never calls Resend or Trustpilot.

The trigger runs in the same transaction as the source status update. A persistence failure rolls back the status, rather than silently losing the registration. Existing customer and finance emails remain separate. The delivery helper runs before those mail side effects. It logs no payload/customer data/provider response.

## Future approved live activation

Do not merge security-test. Selectively publish the feature and apply the reviewed schema to LIVE only after Olivier approves. Configure the singleton mode=live and `TRUSTPILOT_SEND_ENABLED=true`; require exact live Supabase URL, VERCEL_ENV=production, RESEND_API_KEY and MAIL_FROM. TEST fails closed even under Production target. Existing preview registrations never become live, and no historical enqueue action exists.

Transport sends a separate To-only email to the configured exact AFS address; the customer address appears solely inside the documented JSON snippet. Use one Resend idempotency key per lead. The first envelope is persisted and reused unchanged on retry. Atomic status claim prevents concurrent sends. Timeouts leave uncertain (no automatic resend). Explicit rejections can be retried by an admin within 23h of first attempt; after that require provider/Trustpilot investigation, never a blind retry beyond Resend's 24h dedup window. Sending/submitted/uncertain cannot be manually reset by the application. Pending registrations are visible for admin processing if the request ended before mail submission; this release does not add an unattended background job.

Mail acceptance is not proof of AFS receipt, scheduling, delivery or review. `expected_invite_at` is an indicative completion+7days value; actual sending follows Trustpilot settings and acceptance timing. Verify the first authorized real invitation in Trustpilot invitation history after live approval. No actual invitation is part of this preview.

Sources: https://help.trustpilot.com/s/article/How-to-use-Automatic-Feedback-Service-AFS?language=en_US and https://resend.com/docs/dashboard/emails/idempotency-keys

## One explicitly authorized real integration test (TEST only)

Olivier explicitly requested one real end-to-end invitation to his chosen private email, without the normal 7-day delay. The separate `trustpilot-oneoff-test.sql` extension is TEST-only and must never be included in the normal production rollout. A service-only singleton authorization fixes one newly created synthetic lead, exact recipient and expiry. No recipient is accepted from the browser. The before-insert trigger marks only this exact new registration as mode=test and requests preferredSendTime=completion+3minutes in the documented AFS JSON. Existing preview rows remain preview, and the ordinary global 7-day settings remain unchanged. No real review is submitted.

The admin-only `sendTrustpilotRealTestAction` finishes that one lead and invokes the SAME capture/outbox/delivery pipeline. Ordinary customer and finance emails are not called. The sender requires exact TEST database URL, matching unexpired authorization, exact test source/reference/email, config still preview, and the existing mail-provider configuration. No global sending flag is enabled. Atomic claim, frozen envelope and permanent submitted/uncertain states remain shared. The oneoff is shown explicitly as a real test in the admin overview; one mail-service acceptance is still not proof of Trustpilot processing, shortened scheduling, or inbox delivery. Confirm these downstream steps from Trustpilot invitation history/user inbox.
