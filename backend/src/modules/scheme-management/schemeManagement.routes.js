import { Router } from "express";
import { requireActiveAdmin } from "../../middlewares/auth.middleware.js";
import * as controller from "./schemeManagement.controller.js";

const router = Router();
router.use(requireActiveAdmin);
router.get("/", controller.listSchemes);
router.post("/", controller.createScheme);
router.get("/assignment-options", controller.listAssignmentOptions);
router.put("/customers/assignments", controller.assignCustomers);
router.put("/customers/:userId/assignment", controller.assignCustomer);
router.get("/customers/:userId/assignment-history", controller.listAssignmentHistory);
router.get("/customers/:userId/resolution", controller.getCustomerResolution);
router.get("/:schemeId", controller.getScheme);
router.patch("/:schemeId", controller.updateScheme);
router.post("/:schemeId/activate", controller.activateScheme);
router.post("/:schemeId/deactivate", controller.deactivateScheme);
router.put("/:schemeId/default", controller.replaceDefault);
router.get("/:schemeId/versions", controller.listVersions);
router.post("/:schemeId/versions", controller.createDraft);
router.get("/:schemeId/versions/:versionId", controller.getVersion);
router.post("/:schemeId/versions/:versionId/clone", controller.cloneVersion);
router.get("/:schemeId/versions/:versionId/services", controller.listServices);
router.put("/:schemeId/versions/:versionId/services/:serviceId", controller.configureService);

export default router;
