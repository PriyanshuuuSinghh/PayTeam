import { Router } from "express";
import { requireActiveAdmin } from "../../middlewares/auth.middleware.js";
import { listServices, getService, listServiceOperators, listOperators } from "./catalogue.controller.js";

const router = Router();

router.get("/services", requireActiveAdmin, listServices);
router.get("/services/:serviceId", requireActiveAdmin, getService);
router.get("/services/:serviceId/operators", requireActiveAdmin, listServiceOperators);
router.get("/operators", requireActiveAdmin, listOperators);

export default router;
