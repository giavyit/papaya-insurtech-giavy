export type ClaimState =
  | 'SUBMITTED'
  | 'DOCUMENTS_VERIFIED'
  | 'UNDER_ASSESSMENT'
  | 'PENDING_INFO'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAYMENT_INITIATED'
  | 'CLOSED';

export type Role =
  | 'document_clerk'
  | 'team_lead'
  | 'assessor'
  | 'finance'
  | 'system';

export interface StateConfig {
  description: string;
}

export interface TransitionConfig {
  from: ClaimState;
  to: ClaimState;
  preconditions: string[];
  sideEffects: string[];
  authorizedRoles: Role[];
}

export interface CycleDetectionConfig {
  monitoredPath: ClaimState[];
  maxCycles: number;
  errorMessage: string;
}

export interface WorkflowConfig {
  states: Record<string, StateConfig>;
  transitions: TransitionConfig[];
  cycleDetection: CycleDetectionConfig;
}

export interface Claim {
  id: string;
  state: ClaimState;
  createdAt: Date;
  updatedAt: Date;
  data: ClaimData;
  infoRequestCount: number;
}

export interface ClaimData {
  /** Whether all required documents are present */
  documentsPresent?: boolean;
  /** Assigned assessor ID */
  assessorId?: string;
  /** Whether assessment report is complete */
  assessmentReportComplete?: boolean;
  /** Claim amount */
  amount?: number;
  /** Policy limit */
  policyLimit?: number;
  /** Rejection reason */
  rejectionReason?: string;
  /** Description of missing info */
  missingInfoDescription?: string;
  /** Whether new documents/info received */
  newDocumentsReceived?: boolean;
  /** Whether payment request is created */
  paymentRequestCreated?: boolean;
  /** Whether payment is confirmed */
  paymentConfirmed?: boolean;
  /** Whether appeal period expired or member acknowledged */
  appealPeriodExpiredOrAcknowledged?: boolean;
  /** Payment reference */
  paymentReference?: string;
}

export interface AuditEntry {
  readonly id: string;
  readonly timestamp: Date;
  readonly claimId: string;
  readonly fromState: ClaimState;
  readonly toState: ClaimState;
  readonly triggeredBy: {
    readonly userId: string;
    readonly role: Role;
  };
  readonly reason: string;
  readonly success: boolean;
  readonly errorMessage?: string;
}

export interface TransitionRequest {
  claimId: string;
  toState: ClaimState;
  userId: string;
  role: Role;
  reason: string;
  data?: Partial<ClaimData>;
}

export interface TransitionResult {
  success: boolean;
  claim?: Claim;
  error?: string;
  auditEntry: AuditEntry;
}

export interface AvailableTransition {
  toState: ClaimState;
  description: string;
  authorizedRoles: Role[];
  preconditions: string[];
}
