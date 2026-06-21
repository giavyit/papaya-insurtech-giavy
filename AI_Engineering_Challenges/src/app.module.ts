import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { WorkflowModule } from './workflow/workflow.module';
import { AppController } from './app.controller';

@Module({
  imports: [AuditModule, WorkflowModule],
  controllers: [AppController],
})
export class AppModule {}
