import * as mediaModel from "./media.model.js";
import {
  uploadMedia,
  restartRejectedKyc,
} from "./media.service.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import ApiResponse from "../../../utils/ApiResponse.js";
import ApiError from "../../../utils/ApiError.js";
import httpStatus from "../../../utils/httpStatus.js";

const uploadKycMedia = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "Authentication required",
      [],
      "UNAUTHORIZED",
    );
  }

  const { assetType } = req.validatedBody;

  const data = await uploadMedia(userId, assetType, req.file);

  return res
    .status(httpStatus.CREATED)
    .json(
      new ApiResponse(httpStatus.CREATED, data, "Media uploaded successfully"),
    );
});

const restartRejectedKycController = asyncHandler(
  async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Authentication required",
        [],
        "UNAUTHORIZED",
      );
    }

    const data = await restartRejectedKyc(userId);

    return res.status(httpStatus.OK).json(
      new ApiResponse(
        httpStatus.OK,
        data,
        "KYC restarted successfully",
      ),
    );
  },
);

// Restore only safe upload state, never return storage keys or file URLs.
const getMediaStatus = asyncHandler(async (req, res) => {
  const connection = await mediaModel.getConnection();
  try {
    await connection.beginTransaction();
    const cases = await mediaModel.findCasesByUserIdForUpdate(connection, req.user.id);
    if (cases.length !== 1) throw new ApiError(cases.length ? 409 : 404, "KYC case unavailable", [], "KYC_CASE_UNAVAILABLE");
    const current = cases[0];
    const assets = await mediaModel.findMediaByCaseId(connection, current.id);
    const uploadedTypes = [...new Set(assets.filter(asset => ["uploaded", "verified"].includes(asset.status) && ["selfie", "shop_image", "consent_video"].includes(asset.asset_type)).map(asset => asset.asset_type))];
    const [history] = await connection.execute("SELECT id FROM kyc_status_history WHERE case_id = ? AND old_status = 'rejected' AND new_status = 'pending' LIMIT 1", [current.id]);
    await connection.commit();
    res.set("Cache-Control", "no-store").json(new ApiResponse(200, { status: current.status, uploadedTypes, isRestartAttempt: current.status === "pending" && history.length > 0 }, "Media status retrieved"));
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
});

export {
  uploadKycMedia,
  getMediaStatus,
  restartRejectedKycController,
};

export default {
  uploadKycMedia,
  getMediaStatus,
  restartRejectedKycController,
};