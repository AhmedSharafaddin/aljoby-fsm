-- قائمة الطلبات تُرتَّب بـ createdAt، ولوحة المؤشرات تُصفّي بـ completedAt
CREATE INDEX "ServiceOrder_createdAt_idx" ON "ServiceOrder"("createdAt");
CREATE INDEX "ServiceOrder_completedAt_idx" ON "ServiceOrder"("completedAt");
