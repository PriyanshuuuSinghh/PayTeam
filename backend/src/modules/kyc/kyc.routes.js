import { Router } from "express";

import basicDetailsRoutes from "./basic-details/basicDetails.routes.js";
import statusRoutes from "./status/status.routes.js";
import agreementRoutes from "./agreement/agreement.routes.js";
import submissionRoutes from "./submission/submission.routes.js";

const router = Router();

router.use(basicDetailsRoutes);
router.use(statusRoutes);
// Provider-backed verification and KYC media APIs stay out of PayTeam's
// HTTP surface until customer disclosures, provider permissions, and retention
// rules are approved. Their AquaPay reference implementations remain tested.
router.use(agreementRoutes);
router.use(submissionRoutes);

export { router };
export default router;
