import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  Claim,
  ClaimData,
  ClaimState,
  Role,
  TransitionResult,
  AvailableTransition,
  WorkflowConfig,
} from '../types';
import { AuditService } from '../audit/audit.service';
import { PreconditionService } from '../preconditions/precondition.service';
import { SideEffectService } from '../side-effects/side-effect.service';

@Injectable()
export class WorkflowService implements OnModuleInit {
  private readonly logger = new Logger('WorkflowEngine');
  private config!: WorkflowConfig;
  private readonly claims = new Map<string, Claim>();

  constructor(
    private readonly auditService: AuditService,
    private readonly preconditionService: PreconditionService,
    private readonly sideEffectService: SideEffectService,
  ) {}

  onModuleInit() {
    this.loadConfig();
    this.loadMockClaims();
  }

  loadMockClaims(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    try {
      const mockClaimsPath = join(process.cwd(), 'config', 'mock-claims.json');
      const raw = readFileSync(mockClaimsPath, 'utf-8');
      const mockClaims = JSON.parse(raw) as Claim[];
      for (const c of mockClaims) {
        c.createdAt = new Date(c.createdAt);
        c.updatedAt = new Date(c.updatedAt);
        this.claims.set(c.id, c);
      }
      this.logger.log(`Loaded ${mockClaims.length} mock claims`);
    } catch (err) {
      this.logger.warn(`Failed to load mock claims: ${(err as Error).message}`);
    }
  }

  loadConfig(path?: string): void {
    const configPath = path ?? join(process.cwd(), 'config', 'workflow.json');
    const raw = readFileSync(configPath, 'utf-8');
    this.config = JSON.parse(raw) as WorkflowConfig;
    this.logger.log(
      `Workflow config loaded: ${Object.keys(this.config.states).length} states, ${this.config.transitions.length} transitions`,
    );
  }

  getConfig(): WorkflowConfig {
    return this.config;
  }

  createClaim(data?: Partial<ClaimData>): Claim {
    const claim: Claim = {
      id: randomUUID(),
      state: 'SUBMITTED',
      createdAt: new Date(),
      updatedAt: new Date(),
      data: data ?? {},
      infoRequestCount: 0,
    };
    this.claims.set(claim.id, claim);
    this.logger.log(`Claim created: ${claim.id}`);
    return claim;
  }

  getClaim(id: string): Claim | undefined {
    return this.claims.get(id);
  }

  getAllClaims(): Claim[] {
    return Array.from(this.claims.values());
  }

  getAvailableTransitions(claimId: string): AvailableTransition[] {
    const claim = this.claims.get(claimId);
    if (!claim) return [];

    return this.config.transitions
      .filter((t) => t.from === claim.state)
      .map((t) => ({
        toState: t.to,
        description: this.config.states[t.to]?.description ?? '',
        authorizedRoles: t.authorizedRoles,
        preconditions: t.preconditions,
      }));
  }

  transition(request: {
    claimId: string;
    toState: ClaimState;
    userId: string;
    role: Role;
    reason: string;
    data?: Partial<ClaimData>;
  }): TransitionResult {
    const { claimId, toState, userId, role, reason, data } = request;

    const claim = this.claims.get(claimId);
    if (!claim) {
      const entry = this.auditService.createEntry({
        claimId,
        fromState: 'SUBMITTED',
        toState,
        userId,
        role,
        reason,
        success: false,
        errorMessage: `Claim ${claimId} not found`,
      });
      return {
        success: false,
        error: `Claim ${claimId} not found`,
        auditEntry: entry,
      };
    }

    const fromState = claim.state;

    // 1. Find valid transition in config
    const transitionConfig = this.config.transitions.find(
      (t) => t.from === fromState && t.to === toState,
    );

    if (!transitionConfig) {
      const validTargets = this.config.transitions
        .filter((t) => t.from === fromState)
        .map((t) => t.to);
      const errorMsg =
        validTargets.length > 0
          ? `Invalid transition: ${fromState} → ${toState}. Valid transitions from ${fromState}: ${validTargets.join(', ')}`
          : `Invalid transition: ${fromState} → ${toState}. No transitions available from ${fromState}`;

      const entry = this.auditService.createEntry({
        claimId,
        fromState,
        toState,
        userId,
        role,
        reason,
        success: false,
        errorMessage: errorMsg,
      });
      return { success: false, error: errorMsg, auditEntry: entry };
    }

    // 2. Check role authorization
    if (!transitionConfig.authorizedRoles.includes(role)) {
      const errorMsg = `Unauthorized: Role '${role}' cannot perform transition ${fromState} → ${toState}. Required roles: ${transitionConfig.authorizedRoles.join(', ')}`;
      const entry = this.auditService.createEntry({
        claimId,
        fromState,
        toState,
        userId,
        role,
        reason,
        success: false,
        errorMessage: errorMsg,
      });
      return { success: false, error: errorMsg, auditEntry: entry };
    }

    // 3. Check cycle detection (UNDER_ASSESSMENT → PENDING_INFO loop)
    if (fromState === 'UNDER_ASSESSMENT' && toState === 'PENDING_INFO') {
      if (claim.infoRequestCount >= this.config.cycleDetection.maxCycles) {
        const errorMsg = this.config.cycleDetection.errorMessage;
        const entry = this.auditService.createEntry({
          claimId,
          fromState,
          toState,
          userId,
          role,
          reason,
          success: false,
          errorMessage: errorMsg,
        });
        return { success: false, error: errorMsg, auditEntry: entry };
      }
    }

    // 4. Merge data into claim for precondition checking
    if (data) {
      Object.assign(claim.data, data);
    }

    // 5. Check preconditions
    const preconditionError = this.preconditionService.check(
      transitionConfig.preconditions,
      claim,
      data,
    );
    if (preconditionError) {
      const entry = this.auditService.createEntry({
        claimId,
        fromState,
        toState,
        userId,
        role,
        reason,
        success: false,
        errorMessage: preconditionError,
      });
      return { success: false, error: preconditionError, auditEntry: entry };
    }

    // 6. Perform transition
    claim.state = toState;
    claim.updatedAt = new Date();

    // Track info request cycles
    if (fromState === 'UNDER_ASSESSMENT' && toState === 'PENDING_INFO') {
      claim.infoRequestCount++;
    }

    // 7. Execute side effects
    this.sideEffectService.execute(transitionConfig.sideEffects, claim);

    // 8. Audit log
    const entry = this.auditService.createEntry({
      claimId,
      fromState,
      toState,
      userId,
      role,
      reason,
      success: true,
    });

    this.logger.log(
      `Transition: Claim ${claimId} ${fromState} → ${toState} by ${userId} (${role})`,
    );

    return { success: true, claim: { ...claim }, auditEntry: entry };
  }

  /** For testing — clear all claims */
  _reset(): void {
    this.claims.clear();
  }
}
