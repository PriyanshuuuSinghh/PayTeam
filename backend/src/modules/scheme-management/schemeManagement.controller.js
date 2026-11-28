import ApiResponse from "../../utils/ApiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import * as service from "./schemeManagement.service.js";

function respond(read, status = 200) {
  return asyncHandler(async (req, res) => {
    const data = await read(req);
    res.set("Cache-Control", "no-store").status(status).json(new ApiResponse(status, data));
  });
}

const listSchemes = respond((req) => service.listSchemes(req.query));
const getScheme = respond((req) => service.getScheme(req.params.schemeId));
const createScheme = respond((req) => service.createScheme(req.body, req.user.id), 201);
const updateScheme = respond((req) => service.updateScheme(req.params.schemeId, req.body, req.user.id));
const listVersions = respond((req) => service.listVersions(req.params.schemeId, req.query));
const getVersion = respond((req) => service.getVersion(req.params.schemeId, req.params.versionId));
const createDraft = respond((req) => service.createDraft(req.params.schemeId, req.user.id, req.body), 201);
const cloneVersion = respond((req) => service.createDraft(req.params.schemeId, req.user.id, req.body, req.params.versionId), 201);
const listServices = respond((req) => service.listServices(req.params.schemeId, req.params.versionId, req.query));
const configureService = respond((req) =>
  service.configureService(req.params.schemeId, req.params.versionId, req.params.serviceId, req.body, req.user.id));
const activateScheme = respond((req) => service.setSchemeStatus(req.params.schemeId, req.user.id, req.body, 1));
const deactivateScheme = respond((req) => service.setSchemeStatus(req.params.schemeId, req.user.id, req.body, 0));
const replaceDefault = respond((req) => service.replaceDefault(req.params.schemeId, req.user.id, req.body));
const getCustomerResolution = respond((req) => service.getCustomerResolution(req.params.userId));
const listAssignmentOptions = respond((req) => service.listAssignmentOptions(req.query));
const listAssignmentHistory = respond((req) => service.listAssignmentHistory(req.params.userId, req.query));
const assignCustomer = respond((req) => service.assignCustomers(req.body, req.user.id, req.params.userId));
const assignCustomers = respond((req) => service.assignCustomers(req.body, req.user.id));

export {
  listSchemes, getScheme, createScheme, updateScheme, listVersions, getVersion, createDraft, cloneVersion, listServices,
  configureService, activateScheme, deactivateScheme, replaceDefault, getCustomerResolution,
  listAssignmentOptions, listAssignmentHistory, assignCustomer, assignCustomers,
};
