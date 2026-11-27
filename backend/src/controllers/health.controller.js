import { getAppConfig } from "../config/env.js";

function getHealth(req, res) {
  res.status(200).json({
    success: true,
    message: `${getAppConfig().name} is running`,
  });
}

export { getHealth };

export default { getHealth };

