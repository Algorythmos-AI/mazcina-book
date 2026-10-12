CREATE TYPE "public"."gift_card_status" AS ENUM('active', 'void');--> statement-breakpoint
CREATE TYPE "public"."gift_ledger_kind" AS ENUM('issue', 'redeem', 'reverse', 'void');--> statement-breakpoint
CREATE TYPE "public"."gift_order_status" AS ENUM('pending', 'paid', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"gift_card_id" uuid NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gift_card_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"kind" "gift_ledger_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"actor_email" text NOT NULL,
	"note" text,
	"reverses_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_card_ledger_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "gift_card_ledger_nonzero" CHECK ("gift_card_ledger"."amount_cents" <> 0),
	CONSTRAINT "gift_card_ledger_sign" CHECK (("gift_card_ledger"."kind" IN ('issue', 'reverse') AND "gift_card_ledger"."amount_cents" > 0) OR ("gift_card_ledger"."kind" IN ('redeem', 'void') AND "gift_card_ledger"."amount_cents" < 0)),
	CONSTRAINT "gift_card_ledger_reverse_target" CHECK (("gift_card_ledger"."kind" = 'reverse') = ("gift_card_ledger"."reverses_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "gift_card_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount_cents" integer NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_email" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"message" text,
	"status" "gift_order_status" DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "gift_card_orders_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "gift_card_orders_amount_range" CHECK ("gift_card_orders"."amount_cents" >= 2500 AND "gift_card_orders"."amount_cents" <= 50000 AND "gift_card_orders"."amount_cents" % 100 = 0)
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"code_encrypted" text NOT NULL,
	"code_last4" text NOT NULL,
	"initial_cents" integer NOT NULL,
	"balance_cents" integer NOT NULL,
	"status" "gift_card_status" DEFAULT 'active' NOT NULL,
	"expires_on" date NOT NULL,
	"flagged_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	CONSTRAINT "gift_cards_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "gift_cards_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "gift_cards_initial_positive" CHECK ("gift_cards"."initial_cents" > 0),
	CONSTRAINT "gift_cards_balance_range" CHECK ("gift_cards"."balance_cents" >= 0 AND "gift_cards"."balance_cents" <= "gift_cards"."initial_cents")
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_gift_card_id_gift_cards_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_ledger" ADD CONSTRAINT "gift_card_ledger_card_id_gift_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."gift_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_order_id_gift_card_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."gift_card_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_pending" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "gift_card_ledger_card" ON "gift_card_ledger" USING btree ("card_id","created_at");--> statement-breakpoint
CREATE INDEX "gift_card_orders_payment_intent" ON "gift_card_orders" USING btree ("stripe_payment_intent_id");