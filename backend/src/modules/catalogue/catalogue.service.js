import ApiError from "../../utils/ApiError.js";
import catalogueModel from "./catalogue.model.js";
import { parseListOptions, parseServiceId } from "./catalogue.validator.js";

async function readCatalogue(read) {
  try {
    return await read();
  } catch {
    throw new ApiError(503, "Catalogue is temporarily unavailable", "SERVICE_UNAVAILABLE");
  }
}

async function getService(rawId) {
  const id = parseServiceId(rawId);
  const service = await readCatalogue(() => catalogueModel.findService(id));
  if (!service) throw new ApiError(404, "Service not found");
  return service;
}

function getServices(query) {
  const options = parseListOptions(query);
  return readCatalogue(() => catalogueModel.listServices(options));
}

function getOperators(query) {
  const options = parseListOptions(query);
  return readCatalogue(() => catalogueModel.listOperators(options));
}

async function getServiceOperators(rawId, query) {
  const options = parseListOptions(query);
  const service = await getService(rawId);
  const result = await readCatalogue(() => catalogueModel.listServiceOperators(service.id, options));
  return {
    ...result,
    items: result.items.map((operator) => ({
      ...operator,
      selectable: service.status === 1 && operator.status === 1 && operator.operatorStatus === 1,
    })),
  };
}

export { getService, getServices, getOperators, getServiceOperators };
