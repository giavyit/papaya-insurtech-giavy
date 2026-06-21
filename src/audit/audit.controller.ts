import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditEntry } from '../types';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get(':claimId')
  @ApiOperation({ summary: 'Get audit trail for a claim' })
  @ApiParam({ name: 'claimId', description: 'Claim ID' })
  getAuditTrail(@Param('claimId') claimId: string): ReadonlyArray<AuditEntry> {
    return this.auditService.getByClaimId(claimId);
  }
}
