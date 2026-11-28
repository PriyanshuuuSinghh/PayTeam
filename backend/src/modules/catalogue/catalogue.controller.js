import ApiResponse from "../../utils/ApiResponse.js";
import * as catalogue from "./catalogue.service.js";

function respond(read) {
  return async (req, res, next) => {
    try {
      const data = await read(req);
      res.set("Cache-Control", "no-store").json(new ApiResponse(200, data));
    } catch (error) {
      next(error);
    }
  };
}

const listServices = respond((req) => catalogue.getServices(req.query));
const getService = respond((req) => catalogue.getService(req.params.serviceId));
const listServiceOperators = respond((req) => catalogue.getServiceOperators(req.params.serviceId, req.query));
const listOperators = respond((req) => catalogue.getOperators(req.query));

export { listServices, getService, listServiceOperators, listOperators };
