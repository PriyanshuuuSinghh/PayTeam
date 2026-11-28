import ApiError from "../../utils/ApiError.js";
import model from "./schemeManagement.model.js";
import { requireDefaultScheme, resolveCustomerScheme } from "./schemeResolution.js";
import { parseId, parsePagination, parseCreate, parseUpdate, parseConfiguration, validateEmptyAction } from "./schemeManagement.validator.js";

async function database(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.code === "ER_DUP_ENTRY") throw new ApiError(409, "A scheme with that code or name already exists");
    throw new ApiError(503, "Scheme management is temporarily unavailable", "SERVICE_UNAVAILABLE");
  }
}

function write(work) {
  return database(() => model.transaction(work));
}

async function requireScheme(id, connection, lock) {
  const scheme = await model.findScheme(id, connection, lock);
  if (!scheme) throw new ApiError(404, "Scheme not found");
  return scheme;
}

async function requireVersion(schemeId, versionId, connection, lock) {
  const version = await model.findVersion(schemeId, versionId, connection, lock);
  if (!version) throw new ApiError(404, "Scheme version not found");
  return version;
}

function listSchemes(query) {
  const pagination = parsePagination(query);
  return database(() => model.listSchemes(pagination));
}

function getScheme(rawId) {
  const id = parseId(rawId, "scheme");
  return database(() => requireScheme(id));
}

function schemeState({ code, name, description, status }) {
  return { code, name, description, status };
}

async function addDraft(connection, schemeId, actor, sourceVersionId = null) {
  const version = await model.insertDraft(connection, schemeId, actor);
  await model.initializeServices(connection, version.id, sourceVersionId);
  await model.appendAudit(connection, {
    schemeId, versionId: version.id, actor, action: sourceVersionId ? "DRAFT_CLONED" : "DRAFT_CREATED",
    after: { versionNumber: version.versionNumber, status: version.status, sourceVersionId },
  });
  return version;
}

function createScheme(body, actor) {
  const input = parseCreate(body);
  return write(async (connection) => {
    const scheme = await model.insertScheme(connection, input, actor);
    await model.appendAudit(connection, { schemeId: scheme.id, actor, action: "SCHEME_CREATED", after: schemeState(scheme) });
    const initialVersion = await addDraft(connection, scheme.id, actor);
    return { ...scheme, initialVersion };
  });
}

function updateScheme(rawId, body, actor) {
  const id = parseId(rawId, "scheme");
  const input = parseUpdate(body);
  return write(async (connection) => {
    const current = await requireScheme(id, connection, true);
    const next = { ...schemeState(current), ...input };
    if (current.name === next.name && current.description === next.description) return current;
    const updated = await model.updateScheme(connection, id, next, actor);
    await model.appendAudit(connection, {
      schemeId: id, actor, action: "SCHEME_METADATA_UPDATED", before: schemeState(current), after: schemeState(updated),
    });
    return updated;
  });
}

function setSchemeStatus(rawId, actor, body, status) {
  const id = parseId(rawId, "scheme");
  validateEmptyAction(body);
  return write(async (connection) => {
    const defaultId = await requireDefaultScheme(connection, { exclusive: true });
    const current = await requireScheme(id, connection, true);
    if (status === 0 && id === defaultId) throw new ApiError(409, "Replace the default scheme before deactivating it");
    if (current.status === status) return current;
    const updated = await model.updateSchemeStatus(connection, id, status, actor);
    await model.appendAudit(connection, {
      schemeId: id, actor, action: status === 1 ? "SCHEME_ACTIVATED" : "SCHEME_DEACTIVATED",
      before: { status: current.status }, after: { status: updated.status },
    });
    return updated;
  });
}

function replaceDefault(rawId, actor, body) {
  const id = parseId(rawId, "scheme");
  validateEmptyAction(body);
  return write(async (connection) => {
    const previousId = await requireDefaultScheme(connection, { exclusive: true });
    const candidate = await requireScheme(id, connection, true);
    if (candidate.status !== 1) throw new ApiError(409, "Only an active scheme can become the default");
    if (id === previousId) return candidate;
    await model.updateDefault(connection, id);
    await model.appendAudit(connection, {
      schemeId: id, actor, action: "DEFAULT_SCHEME_REPLACED",
      before: { schemeId: previousId }, after: { schemeId: id },
    });
    return requireScheme(id, connection);
  });
}

function getCustomerResolution(rawUserId) {
  const userId = parseId(rawUserId, "customer");
  return database(() => resolveCustomerScheme(userId));
}

function listVersions(rawId, query) {
  const schemeId = parseId(rawId, "scheme");
  const pagination = parsePagination(query);
  return database(async () => {
    await requireScheme(schemeId);
    return model.listVersions(schemeId, pagination);
  });
}

function getVersion(rawId, rawVersionId) {
  const schemeId = parseId(rawId, "scheme");
  const versionId = parseId(rawVersionId, "version");
  return database(() => requireVersion(schemeId, versionId));
}

function createDraft(rawId, actor, body, rawSourceVersionId) {
  const schemeId = parseId(rawId, "scheme");
  const sourceVersionId = rawSourceVersionId === undefined ? null : parseId(rawSourceVersionId, "version");
  validateEmptyAction(body);
  return write(async (connection) => {
    await requireScheme(schemeId, connection, true);
    if (sourceVersionId) await requireVersion(schemeId, sourceVersionId, connection, true);
    return addDraft(connection, schemeId, actor, sourceVersionId);
  });
}

function listServices(rawId, rawVersionId, query) {
  const schemeId = parseId(rawId, "scheme");
  const versionId = parseId(rawVersionId, "version");
  const pagination = parsePagination(query);
  return database(async () => {
    await requireVersion(schemeId, versionId);
    return model.listServices(versionId, pagination);
  });
}

function configureService(rawId, rawVersionId, rawServiceId, body, actor) {
  const schemeId = parseId(rawId, "scheme");
  const versionId = parseId(rawVersionId, "version");
  const serviceId = parseId(rawServiceId, "service");
  const status = parseConfiguration(body);
  return write(async (connection) => {
    const version = await requireVersion(schemeId, versionId, connection, true);
    if (version.status !== "draft") throw new ApiError(409, "Only draft service configuration can change");
    const master = await model.findMasterService(connection, serviceId);
    if (!master) throw new ApiError(404, "Master service not found");
    if (status === 1 && master.status !== 1) throw new ApiError(409, "Master service is inactive");
    const current = await model.findLinkedService(connection, versionId, serviceId);
    if (current?.status === status) return current;
    const updated = await model.saveLinkedService(connection, versionId, serviceId, status, Boolean(current));
    await model.appendAudit(connection, {
      schemeId, versionId, actor, action: "DRAFT_SERVICE_CONFIGURED",
      before: current ? { serviceId, status: current.status } : null,
      after: { serviceId, status: updated.status },
    });
    return updated;
  });
}

export {
  listSchemes, getScheme, createScheme, updateScheme, listVersions, getVersion, createDraft, listServices, configureService,
  setSchemeStatus, replaceDefault, getCustomerResolution,
};
