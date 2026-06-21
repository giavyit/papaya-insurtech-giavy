import { Injectable, Logger } from '@nestjs/common';
import { Claim } from '../types';

type SideEffectHandler = (claim: Claim) => void;

@Injectable()
export class SideEffectService {
  private readonly logger = new Logger('SideEffects');

  private readonly handlers: Record<string, SideEffectHandler> = {
    notify_assessor_team: (claim) => {
      this.logger.log(
        `[NOTIFY] Assessor team notified: Claim ${claim.id} documents verified and ready for assessment`,
      );
    },

    log_assessment_start_time: (claim) => {
      this.logger.log(
        `[LOG] Assessment started for claim ${claim.id} at ${new Date().toISOString()}`,
      );
    },

    notify_member_approved: (claim) => {
      this.logger.log(
        `[NOTIFY] Member notified: Claim ${claim.id} has been approved for amount ${claim.data.amount}`,
      );
    },

    create_payment_request: (claim) => {
      this.logger.log(
        `[PAYMENT] Payment request created for claim ${claim.id}, amount: ${claim.data.amount}`,
      );
    },

    notify_member_rejected: (claim) => {
      this.logger.log(
        `[NOTIFY] Member notified: Claim ${claim.id} rejected. Reason: ${claim.data.rejectionReason}. Appeal instructions sent.`,
      );
    },

    notify_member_info_request: (claim) => {
      this.logger.log(
        `[NOTIFY] Member notified: Additional info needed for claim ${claim.id}: ${claim.data.missingInfoDescription}`,
      );
    },

    reset_assessment_timer: (claim) => {
      this.logger.log(`[TIMER] Assessment timer reset for claim ${claim.id}`);
    },

    trigger_payment_system: (claim) => {
      this.logger.log(
        `[PAYMENT] Payment system triggered for claim ${claim.id}`,
      );
    },

    notify_member_payment_reference: (claim) => {
      this.logger.log(
        `[NOTIFY] Member notified: Payment for claim ${claim.id} completed. Reference: ${claim.data.paymentReference ?? 'PAY-' + claim.id.substring(0, 8)}`,
      );
    },

    archive_claim: (claim) => {
      this.logger.log(`[ARCHIVE] Claim ${claim.id} archived`);
    },
  };

  execute(sideEffectNames: string[], claim: Claim): void {
    for (const name of sideEffectNames) {
      const handler = this.handlers[name];
      if (handler) {
        handler(claim);
      } else {
        this.logger.warn(`Unknown side effect: ${name}`);
      }
    }
  }
}
