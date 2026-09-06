import { AppErrorBoundary } from "@/components/shell/AppErrorBoundary";
import { AppShell } from "@/components/shell/AppShell";

export default function Home() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}
