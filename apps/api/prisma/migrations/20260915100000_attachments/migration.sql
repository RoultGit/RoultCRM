CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "relatedType" "RelatedType" NOT NULL,
    "relatedId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Attachment_path_key" ON "Attachment"("path");
CREATE INDEX "Attachment_tenantId_relatedType_relatedId_idx" ON "Attachment"("tenantId", "relatedType", "relatedId");

ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
