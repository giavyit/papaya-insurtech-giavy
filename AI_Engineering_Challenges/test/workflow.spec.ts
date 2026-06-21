import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from '../src/workflow/workflow.service';
import { AuditService } from '../src/audit/audit.service';
import { PreconditionService } from '../src/preconditions/precondition.service';
import { SideEffectService } from '../src/side-effects/side-effect.service';
import { ClaimState, Role } from '../src/types';

describe('Claims Workflow Engine', () => {
  let workflowService: WorkflowService;
  let auditService: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        AuditService,
        PreconditionService,
        SideEffectService,
      ],
    }).compile();

    workflowService = module.get<WorkflowService>(WorkflowService);
    auditService = module.get<AuditService>(AuditService);
    workflowService.loadConfig();
    workflowService._reset();
    auditService._reset();
  });

  // ============================================================
  // Helper to run a full transition
  // ============================================================
  function doTransition(
    claimId: string,
    toState: ClaimState,
    role: Role,
    data?: Record<string, any>,
  ) {
    return workflowService.transition({
      claimId,
      toState,
      userId: `user-${role}`,
      role,
      reason: `Transition to ${toState}`,
      data,
    });
  }

  // ============================================================
  // SCENARIO 1: Happy Path
  // ============================================================
  describe('Scenario 1 — Happy Path', () => {
    it('should complete full lifecycle: SUBMITTED → CLOSED', () => {
      const claim = workflowService.createClaim({
        amount: 5000,
        policyLimit: 10000,
      });

      const r1 = doTransition(
        claim.id,
        'DOCUMENTS_VERIFIED',
        'document_clerk',
        {
          documentsPresent: true,
        },
      );
      expect(r1.success).toBe(true);
      expect(r1.claim?.state).toBe('DOCUMENTS_VERIFIED');

      const r2 = doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'assessor-1',
      });
      expect(r2.success).toBe(true);
      expect(r2.claim?.state).toBe('UNDER_ASSESSMENT');

      const r3 = doTransition(claim.id, 'APPROVED', 'assessor', {
        assessmentReportComplete: true,
      });
      expect(r3.success).toBe(true);
      expect(r3.claim?.state).toBe('APPROVED');

      const r4 = doTransition(claim.id, 'PAYMENT_INITIATED', 'finance', {
        paymentRequestCreated: true,
      });
      expect(r4.success).toBe(true);
      expect(r4.claim?.state).toBe('PAYMENT_INITIATED');

      const r5 = doTransition(claim.id, 'CLOSED', 'finance', {
        paymentConfirmed: true,
      });
      expect(r5.success).toBe(true);
      expect(r5.claim?.state).toBe('CLOSED');

      // Verify audit trail
      const audit = auditService.getByClaimId(claim.id);
      expect(audit).toHaveLength(5);
      expect(audit.every((e) => e.success)).toBe(true);
    });
  });

  // ============================================================
  // SCENARIO 2: Rejection Path
  // ============================================================
  describe('Scenario 2 — Rejection Path', () => {
    it('should complete rejection: SUBMITTED → REJECTED → CLOSED', () => {
      const claim = workflowService.createClaim();

      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'assessor-1',
      });

      const r3 = doTransition(claim.id, 'REJECTED', 'assessor', {
        assessmentReportComplete: true,
        rejectionReason: 'Claim not covered under policy',
      });
      expect(r3.success).toBe(true);
      expect(r3.claim?.state).toBe('REJECTED');

      const r4 = doTransition(claim.id, 'CLOSED', 'system', {
        appealPeriodExpiredOrAcknowledged: true,
      });
      expect(r4.success).toBe(true);
      expect(r4.claim?.state).toBe('CLOSED');
    });
  });

  // ============================================================
  // SCENARIO 3: Request More Info Loop
  // ============================================================
  describe('Scenario 3 — Request More Info Loop', () => {
    it('should handle info request loop and continue to approval', () => {
      const claim = workflowService.createClaim({
        amount: 3000,
        policyLimit: 10000,
      });

      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'assessor-1',
      });

      // Loop: UNDER_ASSESSMENT → PENDING_INFO → DOCUMENTS_VERIFIED → UNDER_ASSESSMENT
      const rPending = doTransition(claim.id, 'PENDING_INFO', 'assessor', {
        missingInfoDescription: 'Need proof of address',
      });
      expect(rPending.success).toBe(true);

      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        newDocumentsReceived: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'assessor-1',
      });

      // Now approve
      const rApproved = doTransition(claim.id, 'APPROVED', 'assessor', {
        assessmentReportComplete: true,
      });
      expect(rApproved.success).toBe(true);

      doTransition(claim.id, 'PAYMENT_INITIATED', 'finance', {
        paymentRequestCreated: true,
      });
      const rClosed = doTransition(claim.id, 'CLOSED', 'finance', {
        paymentConfirmed: true,
      });
      expect(rClosed.success).toBe(true);
      expect(rClosed.claim?.state).toBe('CLOSED');
    });
  });

  // ============================================================
  // SCENARIO 4: Invalid Transition
  // ============================================================
  describe('Scenario 4 — Invalid Transition', () => {
    it('should reject SUBMITTED → APPROVED with specific error', () => {
      const claim = workflowService.createClaim();

      const result = doTransition(claim.id, 'APPROVED', 'assessor');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(result.error).toContain('SUBMITTED');
      expect(result.error).toContain('APPROVED');
      expect(result.error).toContain('DOCUMENTS_VERIFIED');
    });
  });

  // ============================================================
  // SCENARIO 5: Unauthorized Role
  // ============================================================
  describe('Scenario 5 — Unauthorized Role', () => {
    it('should reject transition by wrong role', () => {
      const claim = workflowService.createClaim();

      // finance trying to verify documents (only document_clerk can)
      const result = doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'finance', {
        documentsPresent: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
      expect(result.error).toContain('finance');
      expect(result.error).toContain('document_clerk');
    });
  });

  // ============================================================
  // Additional Tests: Precondition Failures
  // ============================================================
  describe('Precondition Enforcement', () => {
    it('should reject transition when documents not present', () => {
      const claim = workflowService.createClaim();
      const result = doTransition(
        claim.id,
        'DOCUMENTS_VERIFIED',
        'document_clerk',
        {
          documentsPresent: false,
        },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Precondition failed');
      expect(result.error).toContain('all_documents_present');
    });

    it('should reject approval when amount exceeds policy limit', () => {
      const claim = workflowService.createClaim({
        amount: 20000,
        policyLimit: 10000,
      });
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'assessor-1',
      });
      const result = doTransition(claim.id, 'APPROVED', 'assessor', {
        assessmentReportComplete: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds policy limit');
    });

    it('should reject rejection without reason', () => {
      const claim = workflowService.createClaim();
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'assessor-1',
      });
      const result = doTransition(claim.id, 'REJECTED', 'assessor', {
        assessmentReportComplete: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('rejection_reason_provided');
    });

    it('should reject assessment without assessor assigned', () => {
      const claim = workflowService.createClaim();
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      const result = doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead');
      expect(result.success).toBe(false);
      expect(result.error).toContain('assessor_assigned');
    });

    it('should reject payment without payment request', () => {
      const claim = workflowService.createClaim({
        amount: 5000,
        policyLimit: 10000,
      });
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'a1',
      });
      doTransition(claim.id, 'APPROVED', 'assessor', {
        assessmentReportComplete: true,
      });
      const result = doTransition(claim.id, 'PAYMENT_INITIATED', 'finance');
      expect(result.success).toBe(false);
      expect(result.error).toContain('payment_request_created');
    });
  });

  // ============================================================
  // Cycle Detection
  // ============================================================
  describe('Cycle Detection', () => {
    it('should allow up to 3 info request cycles', () => {
      const claim = workflowService.createClaim({
        amount: 3000,
        policyLimit: 10000,
      });
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'a1',
      });

      // 3 cycles should all succeed
      for (let i = 0; i < 3; i++) {
        const rP = doTransition(claim.id, 'PENDING_INFO', 'assessor', {
          missingInfoDescription: `Missing doc ${i + 1}`,
        });
        expect(rP.success).toBe(true);
        doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
          newDocumentsReceived: true,
        });
        doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
          assessorId: 'a1',
        });
      }

      // 4th should fail
      const rFail = doTransition(claim.id, 'PENDING_INFO', 'assessor', {
        missingInfoDescription: 'Yet another missing doc',
      });
      expect(rFail.success).toBe(false);
      expect(rFail.error).toContain('Maximum information requests exceeded');
      expect(rFail.error).toContain('escalate to team lead');
    });

    it('should not count cycles for other transitions', () => {
      const claim = workflowService.createClaim({
        amount: 3000,
        policyLimit: 10000,
      });
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'a1',
      });

      // Approve directly — no cycle count involved
      const r = doTransition(claim.id, 'APPROVED', 'assessor', {
        assessmentReportComplete: true,
      });
      expect(r.success).toBe(true);
    });
  });

  // ============================================================
  // Audit Trail
  // ============================================================
  describe('Audit Trail', () => {
    it('should record all transitions including failures', () => {
      const claim = workflowService.createClaim();

      // Failed attempt
      doTransition(claim.id, 'APPROVED', 'assessor');
      // Success
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });

      const trail = auditService.getByClaimId(claim.id);
      expect(trail).toHaveLength(2);
      expect(trail[0].success).toBe(false);
      expect(trail[0].errorMessage).toContain('Invalid transition');
      expect(trail[1].success).toBe(true);
      expect(trail[1].fromState).toBe('SUBMITTED');
      expect(trail[1].toState).toBe('DOCUMENTS_VERIFIED');
    });

    it('should include user ID and role in audit entries', () => {
      const claim = workflowService.createClaim();
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });

      const trail = auditService.getByClaimId(claim.id);
      expect(trail[0].triggeredBy.userId).toBe('user-document_clerk');
      expect(trail[0].triggeredBy.role).toBe('document_clerk');
    });

    it('should make audit entries immutable', () => {
      const claim = workflowService.createClaim();
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });

      const trail = auditService.getByClaimId(claim.id);
      expect(() => {
        const mutableEntry = trail[0] as unknown as { reason: string };
        mutableEntry.reason = 'tampered';
      }).toThrow();
    });
  });

  // ============================================================
  // Role Authorization (Additional)
  // ============================================================
  describe('Role Authorization — Additional', () => {
    it('should reject assessor trying to initiate payment', () => {
      const claim = workflowService.createClaim({
        amount: 5000,
        policyLimit: 10000,
      });
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'a1',
      });
      doTransition(claim.id, 'APPROVED', 'assessor', {
        assessmentReportComplete: true,
      });

      const result = doTransition(claim.id, 'PAYMENT_INITIATED', 'assessor', {
        paymentRequestCreated: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
      expect(result.error).toContain('finance');
    });

    it('should reject document_clerk trying to approve', () => {
      const claim = workflowService.createClaim({
        amount: 5000,
        policyLimit: 10000,
      });
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'a1',
      });

      const result = doTransition(claim.id, 'APPROVED', 'document_clerk', {
        assessmentReportComplete: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });
  });

  // ============================================================
  // Config-driven design
  // ============================================================
  describe('Config-driven Design', () => {
    it('should list available transitions from current state', () => {
      const claim = workflowService.createClaim();
      const transitions = workflowService.getAvailableTransitions(claim.id);
      expect(transitions).toHaveLength(1);
      expect(transitions[0].toState).toBe('DOCUMENTS_VERIFIED');
      expect(transitions[0].authorizedRoles).toContain('document_clerk');
    });

    it('should show multiple available transitions from UNDER_ASSESSMENT', () => {
      const claim = workflowService.createClaim({
        amount: 5000,
        policyLimit: 10000,
      });
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'a1',
      });

      const transitions = workflowService.getAvailableTransitions(claim.id);
      const targets = transitions.map((t) => t.toState);
      expect(targets).toContain('APPROVED');
      expect(targets).toContain('REJECTED');
      expect(targets).toContain('PENDING_INFO');
      expect(transitions).toHaveLength(3);
    });

    it('should return no transitions from CLOSED state', () => {
      const claim = workflowService.createClaim({
        amount: 5000,
        policyLimit: 10000,
      });
      doTransition(claim.id, 'DOCUMENTS_VERIFIED', 'document_clerk', {
        documentsPresent: true,
      });
      doTransition(claim.id, 'UNDER_ASSESSMENT', 'team_lead', {
        assessorId: 'a1',
      });
      doTransition(claim.id, 'APPROVED', 'assessor', {
        assessmentReportComplete: true,
      });
      doTransition(claim.id, 'PAYMENT_INITIATED', 'finance', {
        paymentRequestCreated: true,
      });
      doTransition(claim.id, 'CLOSED', 'finance', { paymentConfirmed: true });

      const transitions = workflowService.getAvailableTransitions(claim.id);
      expect(transitions).toHaveLength(0);
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================
  describe('Edge Cases', () => {
    it('should return error for non-existent claim', () => {
      const result = workflowService.transition({
        claimId: 'non-existent',
        toState: 'DOCUMENTS_VERIFIED',
        userId: 'user1',
        role: 'document_clerk',
        reason: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ============================================================
  // Mock Data Seeding
  // ============================================================
  describe('Mock Data Seeding', () => {
    it('should load mock claims and audit entries correctly', () => {
      const originalEnv = process.env.NODE_ENV;
      // Change environment to trigger loader logic
      process.env.NODE_ENV = 'development';
      try {
        workflowService.loadMockClaims();
        auditService.loadMockAudit();

        const claims = workflowService.getAllClaims();
        expect(claims.length).toBeGreaterThanOrEqual(4);

        const submittedClaim = workflowService.getClaim(
          'd3b07384-d113-4ec6-a558-4cbb3035418b',
        );
        expect(submittedClaim).toBeDefined();
        expect(submittedClaim?.state).toBe('SUBMITTED');

        const underAssessmentClaim = workflowService.getClaim(
          '8f070129-450f-4f27-84bc-87c2f0f423ab',
        );
        expect(underAssessmentClaim).toBeDefined();
        expect(underAssessmentClaim?.state).toBe('UNDER_ASSESSMENT');

        const auditTrail = auditService.getByClaimId(
          '8f070129-450f-4f27-84bc-87c2f0f423ab',
        );
        expect(auditTrail.length).toBe(2);
        expect(auditTrail[0].fromState).toBe('SUBMITTED');
        expect(auditTrail[0].toState).toBe('DOCUMENTS_VERIFIED');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
