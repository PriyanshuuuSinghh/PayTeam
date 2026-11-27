import ApiError from "../../utils/ApiError.js";
import { invalid } from "../payments/payment.errors.js";
import { SERVICE_CATALOGUE, getServiceDefinition, validateServiceOperator } from "./serviceCatalogue.js";

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) throw invalid(`${field} is required and must be at most 120 characters`);
  return value.trim();
}
function positiveId(value, field) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw invalid(`Invalid ${field}`);
  return id;
}

function validateRate(rate, field) {
  if (rate === null) return null;
  if (!rate || typeof rate !== "object" || !["percentage", "flat"].includes(rate.type)) throw invalid(`Invalid ${field} configuration`, "RATE_CONFIGURATION_INVALID");
  if (typeof rate.value !== "string") throw invalid(`${field} value must be a decimal string`, "RATE_CONFIGURATION_INVALID");
  const raw = rate.value.trim();
  const pattern = rate.type === "percentage" ? /^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/ : /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
  if (!pattern.test(raw)) throw invalid(`Invalid ${field} value`, "RATE_CONFIGURATION_INVALID");
  return { type: rate.type, value: raw };
}

function projectScheme(scheme) {
  if (!scheme || typeof scheme !== "object" || Array.isArray(scheme) || scheme.id === undefined || typeof scheme.name !== "string") throw invalid("Scheme repository returned an invalid record", "SCHEME_REPOSITORY_INVALID");
  return { id: scheme.id, name: scheme.name, isDefault: Boolean(scheme.isDefault) };
}

function projectUserConfiguration(config, serviceCode, operator) {
  if (!config || typeof config !== "object") throw invalid("Configuration repository returned an invalid record", "RATE_CONFIGURATION_INVALID");
  const serviceCharge = validateRate(config.serviceCharge, "service charge");
  if (!serviceCharge) throw invalid("Service charge configuration is missing", "RATE_CONFIGURATION_INVALID");
  const instantCharge = config.instantCharge == null ? null : validateRate(config.instantCharge, "instant charge");
  return {
    schemeId: config.schemeId,
    serviceCode,
    operator,
    serviceCharge,
    instantCharge,
    intendedSettlementMode: instantCharge === null ? "T_PLUS_1" : "INSTANT",
  };
}

function createSchemeService(repository) {
  return Object.freeze({
    listForUser: async (userId) => {
      const actorId = positiveId(userId, "user ID");
      const schemes = await repository.listAvailableSchemesForUser(actorId);
      if (!Array.isArray(schemes)) throw invalid("Scheme repository returned an invalid list", "SCHEME_REPOSITORY_INVALID");
      return schemes.map(projectScheme);
    },
    listAll: async () => {
      const schemes = await repository.listAllSchemes();
      if (!Array.isArray(schemes)) throw invalid("Scheme repository returned an invalid list", "SCHEME_REPOSITORY_INVALID");
      return schemes.map(projectScheme);
    },
    listServices: async () => SERVICE_CATALOGUE,
    create: async ({ name, isDefault = false }) => {
      if (typeof isDefault !== "boolean") throw invalid("isDefault must be a boolean");
      return repository.createScheme({ name: requiredString(name, "name"), isDefault });
    },
    rename: async (schemeId, { name }) => {
      const updated = await repository.renameScheme(positiveId(schemeId, "scheme ID"), requiredString(name, "name"));
      if (!updated) throw new ApiError(404, "Scheme not found", [], "NOT_FOUND");
      return projectScheme(updated);
    },
    setDefault: async (schemeId) => {
      const updated = await repository.setDefaultScheme(positiveId(schemeId, "scheme ID"));
      if (!updated) throw new ApiError(404, "Active scheme not found", [], "NOT_FOUND");
      return projectScheme(updated);
    },
    assign: async (actorId, userId, schemeId) => {
      const result = await repository.assignScheme({ actorId: positiveId(actorId, "actor ID"), userId: positiveId(userId, "user ID"), schemeId: positiveId(schemeId, "scheme ID") });
      if (!result) throw new ApiError(404, "Active user or scheme not found", [], "NOT_FOUND");
      return result;
    },
    getAssigned: async (userId) => {
      const assigned = await repository.findAssignedScheme(positiveId(userId, "user ID"));
      return assigned ? projectScheme(assigned) : null;
    },
    getConfiguration: async (userId, serviceCode, operator) => {
      const service = getServiceDefinition(serviceCode);
      if (!service) throw invalid("Unsupported service", "SERVICE_INVALID");
      if (!validateServiceOperator(serviceCode, operator)) throw invalid("Operator is not configured for this service", "OPERATOR_INVALID");
      const config = await repository.findSafeConfigurationForUser({ userId: positiveId(userId, "user ID"), serviceCode, operator });
      if (!config) throw new ApiError(404, "Service operator configuration not found", [], "RATE_CONFIGURATION_NOT_FOUND");
      return projectUserConfiguration(config, serviceCode, operator);
    },
    setConfiguration: async (schemeId, serviceCode, operator, input, actorId) => {
      const id = positiveId(schemeId, "scheme ID");
      const createdBy = positiveId(actorId, "actor ID");
      if (!getServiceDefinition(serviceCode)) throw invalid("Unsupported service", "SERVICE_INVALID");
      if (!validateServiceOperator(serviceCode, operator)) throw invalid("Operator is not configured for this service", "OPERATOR_INVALID");
      if (!input || typeof input !== "object" || !Array.isArray(input.commissions)) throw invalid("Configuration must include commission rates");
      const levels = new Set();
      const commissions = input.commissions.map((commission) => {
        const hierarchyLevel = Number(commission?.hierarchyLevel);
        if (!Number.isSafeInteger(hierarchyLevel) || hierarchyLevel < 1 || hierarchyLevel > 128 || levels.has(hierarchyLevel)) throw invalid("Invalid or duplicate commission hierarchy level", "RATE_CONFIGURATION_INVALID");
        levels.add(hierarchyLevel);
        return { hierarchyLevel, ...validateRate(commission, "commission") };
      });
      const configuration = {
        serviceCharge: validateRate(input.serviceCharge, "service charge"),
        instantCharge: input.instantCharge == null ? null : validateRate(input.instantCharge, "instant charge"),
        commissions,
      };
      if (!configuration.serviceCharge) throw invalid("Service charge configuration is required", "RATE_CONFIGURATION_INVALID");
      const saved = await repository.setApplicableConfiguration({ schemeId: id, serviceCode, operator, configuration, createdBy });
      if (!saved) throw new ApiError(404, "Active scheme service/operator mapping not found", [], "NOT_FOUND");
      return saved;
    },
  });
}

export { createSchemeService, projectScheme, projectUserConfiguration };
