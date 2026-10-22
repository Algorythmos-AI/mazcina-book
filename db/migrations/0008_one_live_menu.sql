-- Stop with a clear message, rather than a bare unique violation, if the data
-- already breaks the rule: archive the extra live seasonal menu, then redeploy.
DO $$
BEGIN
  IF (SELECT count(*) FROM "menus" WHERE "status" = 'live' AND "kind" = 'seasonal' AND "archived_at" IS NULL) > 1 THEN
    RAISE EXCEPTION 'More than one seasonal menu is live. Archive all but one on the Menu page, then deploy again.';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "menus_one_live_seasonal" ON "menus" USING btree ("kind") WHERE "menus"."status" = 'live' AND "menus"."kind" = 'seasonal' AND "menus"."archived_at" IS NULL;