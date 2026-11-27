import ApiError from "../../utils/ApiError.js";

/**
 * Add Money depends on this payment-side port, not on Scheme Manager storage.
 *
 * resolveConfiguration({ userId, serviceCode, operator }) returns one of:
 * - { status: "RESOLVED", configuration: { serviceCode, operator,
 *     serviceCharge, instantCharge, commissions } }
 * - { status: "UNSUPPORTED" } when the selected service/operator is not eligible.
 * - { status: "NOT_CONFIGURED" | "UNAVAILABLE" } when configuration cannot be
 *   safely resolved. The resolver must not invent a default scheme or rates.
 *
 * The configuration contains only calculation inputs. It intentionally carries
 * no Scheme Manager IDs or table-specific records; Add Money snapshots the
 * resolved values onto the transaction for historical calculation traceability.
 */
function createUnavailableAddMoneyConfigurationResolver() {
  return Object.freeze({
    async resolveConfiguration() {
      return { status: "UNAVAILABLE" };
    },
  });
}

function addMoneyConfigurationUnavailable() {
  return new ApiError(503, "Add Money configuration is unavailable", [], "ADD_MONEY_CONFIGURATION_UNAVAILABLE");
}

function addMoneyConfigurationInvalid() {
  return new ApiError(503, "Add Money configuration could not be verified", [], "ADD_MONEY_CONFIGURATION_INVALID");
}

export {
  addMoneyConfigurationInvalid,
  addMoneyConfigurationUnavailable,
  createUnavailableAddMoneyConfigurationResolver,
};
