import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-hf-bg px-4"
      data-testid="not-found-page"
    >
      <EmptyState
        title="Page not found"
        description="That route is not part of this studio. Return home to plan and run workflows."
        action={
          <Link
            href="/"
            className="inline-flex h-8 items-center rounded-md bg-hf-violet px-2.5 text-xs font-medium text-hf-text hover:brightness-110"
          >
            Back to studio
          </Link>
        }
      />
    </div>
  );
}
