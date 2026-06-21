import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { PreconditionService } from '../preconditions/precondition.service';
import { SideEffectService } from '../side-effects/side-effect.service';

@Module({
  providers: [WorkflowService, PreconditionService, SideEffectService],
  controllers: [WorkflowController],
  exports: [WorkflowService],
})
export class WorkflowModule {}
