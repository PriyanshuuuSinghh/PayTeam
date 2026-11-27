const SERVICE_CATALOGUE = Object.freeze([
  { id: "Silver 1", provider: "Nixa Silver 1" },
  { id: "DYNAMICQR", provider: null },
  { id: "QRMTB", provider: null },
  { id: "PREPAID", provider: null },
  { id: "POSFUNDREQUEST", provider: null },
  { id: "Premium 2", provider: null },
  { id: "Premium 4", provider: null },
  { id: "Diamond 3", provider: "Nixa Silver 2" },
  { id: "RUPAYUPI", provider: null },
  { id: "UPIPAYOUT", provider: null },
  { id: "POSTPAID", provider: null },
  { id: "NIXAPOS", provider: null },
  { id: "Diamond 4", provider: "Nixa Premium 3 / NixaSoft Premium PG 3", gateway: "PREMIUM_PG_3", operators: ["MASTERCARD", "RUPAY", "VISA", "UPI"] },
  { id: "Silver 2", provider: null },
  { id: "Silver 3", provider: "Nixa Silver 3" },
  { id: "Payout", provider: null },
  { id: "CREDITCARD", provider: null },
  { id: "DTH", provider: null },
  { id: "NIXACFPG5", provider: null },
  { id: "Premium 5", provider: "Nixa Premium 4" },
  { id: "Diamond 2", provider: null },
  { id: "Silver 4", provider: "Nixa Silver 4" },
  { id: "MTB", provider: null },
  { id: "BBPS", provider: null },
  { id: "BBPSI", provider: null },
  { id: "NIXAPREMlUM2", provider: null },
  { id: "Silver 5", provider: "Nixa Silver 5" },
  { id: "Platinum 2", provider: "Pinlab Yana Grocery" },
]);

const SERVICE_BY_ID = new Map(SERVICE_CATALOGUE.map((service) => [service.id, service]));
function getServiceDefinition(serviceId) { return SERVICE_BY_ID.get(serviceId) || null; }
function validateServiceOperator(serviceId, operator) {
  const service = getServiceDefinition(serviceId);
  if (!service) return false;
  return Array.isArray(service.operators) && service.operators.includes(operator);
}

export { SERVICE_CATALOGUE, getServiceDefinition, validateServiceOperator };
