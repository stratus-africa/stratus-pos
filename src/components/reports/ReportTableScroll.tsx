import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ReportTableScrollProps {
  children: ReactNode;
  /** Tailwind max-height class controlling the scroll viewport. */
  maxHeight?: string;
  className?: string;
}

/**
 * Scroll container for report tables.
 * Only the table body scrolls — surrounding report cards, filters and summary
 * cards stay fixed in place. Table headers stick to the top while scrolling.
 */
const ReportTableScroll = ({ children, maxHeight = "max-h-[55vh]", className }: ReportTableScrollProps) => (
  <div
    className={cn(
      "relative overflow-auto rounded border",
      "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-muted",
      maxHeight,
      className,
    )}
  >
    {children}
  </div>
);

export default ReportTableScroll;
