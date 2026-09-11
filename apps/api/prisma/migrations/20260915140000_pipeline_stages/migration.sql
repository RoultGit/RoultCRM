CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PipelineStage_tenantId_stage_key" ON "PipelineStage"("tenantId", "stage");
CREATE INDEX "PipelineStage_tenantId_idx" ON "PipelineStage"("tenantId");

ALTER TABLE "PipelineStage" ENABLE ROW LEVEL SECURITY;
