import ApiError from "../../utils/ApiError.js";

function unavailable(message = "Payment persistence is not configured") {
  return new ApiError(503, message, [], "PAYMENT_CAPABILITY_UNAVAILABLE");
}

function invalid(message, code = "VALIDATION_ERROR") {
  return new ApiError(400, message, [], code);
}

function conflict(message, code = "CONFLICT") {
  return new ApiError(409, message, [], code);
}

function notConfigured(capability) {
  return new ApiError(503, `${capability} provider is not configured`, [], "NOT_CONFIGURED");
}

export { unavailable, invalid, conflict, notConfigured };
