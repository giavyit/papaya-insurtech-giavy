import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
} from 'class-validator';

export class CreateClaimDto {
  @ApiPropertyOptional({ description: 'Optional claim amount' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Policy limit' })
  @IsOptional()
  @IsNumber()
  policyLimit?: number;
}

export class TransitionDto {
  @ApiProperty({
    description: 'Target state',
    enum: [
      'SUBMITTED',
      'DOCUMENTS_VERIFIED',
      'UNDER_ASSESSMENT',
      'PENDING_INFO',
      'APPROVED',
      'REJECTED',
      'PAYMENT_INITIATED',
      'CLOSED',
    ],
  })
  @IsString()
  @IsNotEmpty()
  toState: string;

  @ApiProperty({ description: 'User ID performing the transition' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Role of the user',
    enum: ['document_clerk', 'team_lead', 'assessor', 'finance', 'system'],
  })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({ description: 'Reason or notes for the transition' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'All required documents present' })
  @IsOptional()
  @IsBoolean()
  documentsPresent?: boolean;

  @ApiPropertyOptional({ description: 'Assessor ID to assign' })
  @IsOptional()
  @IsString()
  assessorId?: string;

  @ApiPropertyOptional({ description: 'Assessment report complete' })
  @IsOptional()
  @IsBoolean()
  assessmentReportComplete?: boolean;

  @ApiPropertyOptional({ description: 'Claim amount' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Policy limit' })
  @IsOptional()
  @IsNumber()
  policyLimit?: number;

  @ApiPropertyOptional({ description: 'Rejection reason' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Missing info description' })
  @IsOptional()
  @IsString()
  missingInfoDescription?: string;

  @ApiPropertyOptional({ description: 'New documents received' })
  @IsOptional()
  @IsBoolean()
  newDocumentsReceived?: boolean;

  @ApiPropertyOptional({ description: 'Payment request created' })
  @IsOptional()
  @IsBoolean()
  paymentRequestCreated?: boolean;

  @ApiPropertyOptional({ description: 'Payment confirmed' })
  @IsOptional()
  @IsBoolean()
  paymentConfirmed?: boolean;

  @ApiPropertyOptional({ description: 'Appeal period expired or acknowledged' })
  @IsOptional()
  @IsBoolean()
  appealPeriodExpiredOrAcknowledged?: boolean;

  @ApiPropertyOptional({ description: 'Payment reference number' })
  @IsOptional()
  @IsString()
  paymentReference?: string;
}
