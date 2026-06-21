import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { WorkflowService } from './workflow.service';
import { CreateClaimDto, TransitionDto } from './dto';
import { ClaimState, Role } from '../types';

@ApiTags('Claims')
@Controller('claims')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new claim' })
  createClaim(@Body() dto: CreateClaimDto) {
    return this.workflowService.createClaim({
      amount: dto.amount,
      policyLimit: dto.policyLimit,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all claims' })
  getAllClaims() {
    return this.workflowService.getAllClaims();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get claim details with current state' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  getClaim(@Param('id') id: string) {
    const claim = this.workflowService.getClaim(id);
    if (!claim) {
      throw new HttpException(`Claim ${id} not found`, HttpStatus.NOT_FOUND);
    }
    const transitions = this.workflowService.getAvailableTransitions(id);
    return { claim, availableTransitions: transitions };
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Advance claim to a new state' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  transition(@Param('id') id: string, @Body() dto: TransitionDto) {
    const result = this.workflowService.transition({
      claimId: id,
      toState: dto.toState as ClaimState,
      userId: dto.userId,
      role: dto.role as Role,
      reason: dto.reason,
      data: {
        documentsPresent: dto.documentsPresent,
        assessorId: dto.assessorId,
        assessmentReportComplete: dto.assessmentReportComplete,
        amount: dto.amount,
        policyLimit: dto.policyLimit,
        rejectionReason: dto.rejectionReason,
        missingInfoDescription: dto.missingInfoDescription,
        newDocumentsReceived: dto.newDocumentsReceived,
        paymentRequestCreated: dto.paymentRequestCreated,
        paymentConfirmed: dto.paymentConfirmed,
        appealPeriodExpiredOrAcknowledged:
          dto.appealPeriodExpiredOrAcknowledged,
        paymentReference: dto.paymentReference,
      },
    });

    if (!result.success) {
      throw new HttpException(
        {
          error: result.error,
          auditEntry: result.auditEntry,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }
}
