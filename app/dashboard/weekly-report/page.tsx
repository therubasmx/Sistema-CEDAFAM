import { auth } from "@/lib/auth";
import { SetupAttendingProfile } from "@/components/setup-attending-profile";
import { WeeklyReportClient } from "./weekly-report-client";

export default async function WeeklyReportPage() {
  const session = await auth();
  const user = session!.user;

  if (!user.psychologistId) {
    return <SetupAttendingProfile userId={user.id} redirectTo="/dashboard/weekly-report" />;
  }

  return <WeeklyReportClient />;
}
