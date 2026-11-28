import { randomUUID } from "node:crypto";
import asyncHandler from "../../../../utils/asyncHandler.js";
import ApiResponse from "../../../../utils/ApiResponse.js";
import ApiError from "../../../../utils/ApiError.js";
import httpStatus from "../../../../utils/httpStatus.js";
import digilockerService from "./digilocker.service.js";
import digilockerProvider from "./digilocker.provider.js";

const HTML_SUCCESS_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PayTeam verification</title><main><h1>Verification completed</h1><p>Return to your PayTeam application and check the verification status. You may close this tab.</p></main></html>`;

const callback = asyncHandler(async (req, res) => {
  const correlationId = randomUUID();
  res.set("X-Correlation-ID", correlationId);
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  const isHtml = req.headers.accept?.includes("text/html");

  try {
    const data = await digilockerService.completeCallback(req.validatedCallback, { correlationId });
    if (isHtml) {
      return res.status(httpStatus.OK).send(HTML_SUCCESS_PAGE);
    }
    return res.status(httpStatus.OK).json(
      new ApiResponse(httpStatus.OK, { verificationType: data.verificationType, verificationStatus: data.verificationStatus, stepNumber: data.stepNumber, steps_completed: data.steps_completed }, "DigiLocker verification completed"),
    );
  } catch (err) {
    // Never render success for an expired, replayed or failed callback.
    throw err;
  }
});

const mockAuthorize = asyncHandler(async (req, res) => {
  const queryKeys = Object.keys(req.query || {});
  if (
    digilockerProvider.mode !== "mock" ||
    queryKeys.length !== 2 ||
    !queryKeys.includes("state") ||
    !queryKeys.includes("document")
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid local mock authorization request", [], "INVALID_MOCK_AUTHORIZATION");
  }

  let callbackParameters;
  try {
    callbackParameters = digilockerProvider.getMockCallbackParameters(req.query);
  } catch {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid local mock authorization request", [], "INVALID_MOCK_AUTHORIZATION");
  }

  const target = new URL("/api/kyc/digilocker/callback", "http://localhost");
  for (const [key, value] of Object.entries(callbackParameters)) {
    target.searchParams.set(key, value);
  }
  return res.redirect(303, `${target.pathname}${target.search}`);
});

export { callback, mockAuthorize };
export default { callback, mockAuthorize };
