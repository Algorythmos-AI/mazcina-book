ALTER TYPE "public"."gift_ledger_kind" ADD VALUE 'adjust';--> statement-breakpoint
ALTER TABLE "gift_card_ledger" DROP CONSTRAINT "gift_card_ledger_sign";--> statement-breakpoint
ALTER TABLE "gift_card_orders" ADD COLUMN "payment_issue" text;--> statement-breakpoint
ALTER TABLE "gift_card_orders" ADD COLUMN "payment_issue_voids" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_card_ledger" ADD CONSTRAINT "gift_card_ledger_sign" CHECK (("gift_card_ledger"."kind"::text IN ('issue', 'reverse') AND "gift_card_ledger"."amount_cents" > 0) OR ("gift_card_ledger"."kind"::text IN ('redeem', 'void') AND "gift_card_ledger"."amount_cents" < 0) OR "gift_card_ledger"."kind"::text = 'adjust');