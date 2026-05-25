CREATE UNIQUE INDEX "awaiting_human_bridges_interaction_active_uq" ON "awaiting_human_bridges" USING btree ("interaction_id") WHERE "status" in ('pending_delivery', 'waiting_for_human');
