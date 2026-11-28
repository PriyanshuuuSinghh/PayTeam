import { Router } from "express";

import basicDetailsRoutes from "./basic-details/basicDetails.routes.js";
import statusRoutes from "./status/status.routes.js";
import digilockerRoutes from "./document-verification/digilocker/digilocker.routes.js";
import aadhaarRoutes from "./document-verification/aadhaar/aadhaar.routes.js";
import panRoutes from "./document-verification/pan/pan.routes.js";
import agreementRoutes from "./agreement/agreement.routes.js";
import submissionRoutes from "./submission/submission.routes.js";

const router = Router();

router.use(basicDetailsRoutes);
router.use(statusRoutes);
router.use(digilockerRoutes);
router.use(aadhaarRoutes);
router.use(panRoutes);
// Bank and media APIs remain outside the PayTeam HTTP surface until their
// separate provider, disclosure, and retention requirements are approved.
router.use(agreementRoutes);
router.use(submissionRoutes);

export { router };
export default router;
