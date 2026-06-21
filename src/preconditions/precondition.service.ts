import { Injectable } from '@nestjs/common';
import { Claim, ClaimData } from '../types';

type PreconditionChecker = (
  claim: Claim,
  data?: Partial<ClaimData>,
) => string | null;

@Injectable()
export class PreconditionService {
  private readonly checkers: Record<string, PreconditionChecker> = {
    all_documents_present: (claim, data) => {
      const docs = data?.documentsPresent ?? claim.data.documentsPresent;
      return docs ? null : 'All required documents must be present';
    },

    assessor_assigned: (claim, data) => {
      const assessor = data?.assessorId ?? claim.data.assessorId;
      return assessor ? null : 'An assessor must be assigned before assessment';
    },

    assessment_report_complete: (claim, data) => {
      const complete =
        data?.assessmentReportComplete ?? claim.data.assessmentReportComplete;
      return complete ? null : 'Assessment report must be complete';
    },

    amount_within_policy_limit: (claim, data) => {
      const amount = data?.amount ?? claim.data.amount;
      const limit = data?.policyLimit ?? claim.data.policyLimit;
      if (amount == null || limit == null) {
        return 'Both claim amount and policy limit must be specified';
      }
      return amount <= limit
        ? null
        : `Claim amount (${amount}) exceeds policy limit (${limit})`;
    },

    rejection_reason_provided: (claim, data) => {
      const reason = data?.rejectionReason ?? claim.data.rejectionReason;
      return reason ? null : 'A rejection reason must be provided';
    },

    missing_info_description_provided: (claim, data) => {
      const desc =
        data?.missingInfoDescription ?? claim.data.missingInfoDescription;
      return desc
        ? null
        : 'A description of missing information must be provided';
    },

    new_documents_received: (claim, data) => {
      const received =
        data?.newDocumentsReceived ?? claim.data.newDocumentsReceived;
      return received ? null : 'New documents or information must be received';
    },

    payment_request_created: (claim, data) => {
      const created =
        data?.paymentRequestCreated ?? claim.data.paymentRequestCreated;
      return created ? null : 'A payment request must be created first';
    },

    payment_confirmed: (claim, data) => {
      const confirmed = data?.paymentConfirmed ?? claim.data.paymentConfirmed;
      return confirmed ? null : 'Payment must be confirmed';
    },

    appeal_period_expired_or_acknowledged: (claim, data) => {
      const done =
        data?.appealPeriodExpiredOrAcknowledged ??
        claim.data.appealPeriodExpiredOrAcknowledged;
      return done
        ? null
        : 'Appeal period must be expired or member must have acknowledged the rejection';
    },
  };

  /**
   * Check all preconditions. Returns null if all pass, or the first failure message.
   */
  check(
    preconditionNames: string[],
    claim: Claim,
    data?: Partial<ClaimData>,
  ): string | null {
    for (const name of preconditionNames) {
      const checker = this.checkers[name];
      if (!checker) {
        return `Unknown precondition: ${name}`;
      }
      const error = checker(claim, data);
      if (error) {
        return `Precondition failed [${name}]: ${error}`;
      }
    }
    return null;
  }
}
