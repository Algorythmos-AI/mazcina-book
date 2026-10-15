ALTER TABLE "gift_card_orders" ADD COLUMN "client_ip_hash" text;--> statement-breakpoint
CREATE INDEX "gift_card_orders_ip_recent" ON "gift_card_orders" USING btree ("client_ip_hash","created_at");