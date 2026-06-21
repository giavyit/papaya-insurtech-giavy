import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditEntry, ClaimState, Role } from '../types';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly entries: AuditEntry[] = [];

  onModuleInit() {
    this.loadMockAudit();
  }

  loadMockAudit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    try {
      const mockAuditPath = join(process.cwd(), 'config', 'mock-audit.json');
      const raw = readFileSync(mockAuditPath, 'utf-8');
      const mockEntries = JSON.parse(raw) as AuditEntry[];
      for (const e of mockEntries) {
        this.entries.push(
          Object.freeze({
            ...e,
            timestamp: new Date(e.timestamp),
            triggeredBy: Object.freeze(e.triggeredBy),
          }),
        );
      }
    } catch {
      // Ignore if not present
    }
  }

  createEntry(params: {
    claimId: string;
    fromState: ClaimState;
    toState: ClaimState;
    userId: string;
    role: Role;
    reason: string;
    success: boolean;
    errorMessage?: string;
  }): AuditEntry {
    const entry: AuditEntry = Object.freeze({
      id: randomUUID(),
      timestamp: new Date(),
      claimId: params.claimId,
      fromState: params.fromState,
      toState: params.toState,
      triggeredBy: Object.freeze({
        userId: params.userId,
        role: params.role,
      }),
      reason: params.reason,
      success: params.success,
      errorMessage: params.errorMessage,
    });

    this.entries.push(entry);
    return entry;
  }

  getByClaimId(claimId: string): ReadonlyArray<AuditEntry> {
    return this.entries.filter((e) => e.claimId === claimId);
  }

  getAll(): ReadonlyArray<AuditEntry> {
    return [...this.entries];
  }

  /** For testing only — reset all entries */
  _reset(): void {
    this.entries.length = 0;
  }
}
