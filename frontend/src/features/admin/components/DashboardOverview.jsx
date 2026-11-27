import React from "react";
import { PlatformHealth } from "./PlatformHealth";
import { OperationalQueues } from "./OperationalQueues";
import { BusinessPerformance } from "./BusinessPerformance";

export function DashboardOverview({ refreshVersion, onBusinessRefreshComplete }) {
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 pb-8 sm:space-y-5">
      <h1 className="sr-only">PayTeam Admin Dashboard</h1>
      <PlatformHealth />
      <OperationalQueues />
      <BusinessPerformance refreshVersion={refreshVersion} onRefreshComplete={onBusinessRefreshComplete} />
    </div>
  );
}
