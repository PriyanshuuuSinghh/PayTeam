import React, { memo } from "react";
import { PlatformHealth } from "./PlatformHealth";
import { OperationalQueues } from "./OperationalQueues";
import { BusinessPerformance } from "./BusinessPerformance";

export const DashboardOverview = memo(function DashboardOverview({ refreshVersion, onBusinessRefreshComplete }) {
  return (
    <div className="mx-auto max-w-[1500px] space-y-3 pb-6 sm:space-y-4">
      <h1 className="sr-only">PayTeam Admin Dashboard</h1>
      <PlatformHealth />
      <OperationalQueues />
      <BusinessPerformance refreshVersion={refreshVersion} onRefreshComplete={onBusinessRefreshComplete} />
    </div>
  );
});
