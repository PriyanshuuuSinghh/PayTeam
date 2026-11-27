import { createPayoutService } from "./payout/payout.service.js";
import { createPayoutProvider } from "./payout/payout.provider.js";
import { createCreditCardBill2Service } from "./credit-card-bill-2/creditCardBill2.service.js";
import { createCreditCardBillProvider } from "./credit-card-bill-2/bill.provider.js";

function createProductContracts(repository, { payoutProvider = createPayoutProvider(), billProvider = createCreditCardBillProvider() } = {}) {
  const payout = createPayoutService({ repository, provider: payoutProvider });
  const bill = createCreditCardBill2Service({ repository, provider: billProvider });
  return Object.freeze({
    listBeneficiaries: ({ actorId }) => payout.listBeneficiaries(actorId),
    createBeneficiary: ({ actorId, providerPayload }) => payout.createBeneficiary({ userId: actorId, details: providerPayload }),
    verifyBeneficiary: ({ actorId, beneficiaryId }) => payout.verifyBeneficiary({ userId: actorId, beneficiaryId }),
    createPayout: ({ actorId, beneficiaryId, amount, idempotencyKey }) => payout.createPayout({ userId: actorId, beneficiaryId, amount, idempotencyKey }),
    getPayout: ({ actorId, payoutId }) => payout.getPayout({ userId: actorId, payoutId }),
    createBillEnquiry: ({ actorId, customerReference, idempotencyKey }) => bill.createEnquiry({ userId: actorId, customerReference, idempotencyKey }),
    getBillEnquiry: ({ actorId, enquiryId }) => bill.getEnquiry({ userId: actorId, enquiryId }),
    createBillPayment: ({ actorId, enquiryId, idempotencyKey }) => bill.createPayment({ userId: actorId, enquiryId, idempotencyKey }),
    getBillPayment: ({ actorId, paymentId }) => bill.getPayment({ userId: actorId, paymentId }),
  });
}

export { createProductContracts };
