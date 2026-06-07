UPDATE "_prisma_migrations" 
SET "finished_at" = NOW(), 
    "applied_steps_count" = 1,
    "logs" = NULL,
    "rolled_back_at" = NULL
WHERE "migration_name" = '20260607071730_merge_chat_modelsnpx';