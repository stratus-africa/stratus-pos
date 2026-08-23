import type { ReactNode } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
export type InventoryTabItem = { key: string; label: string; icon: ReactNode };
export function InventoryTabNavigation({ items }: { items: readonly InventoryTabItem[] }) { return <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">{items.map(item => <TabsTrigger key={item.key} value={item.key} className="gap-2">{item.icon}{item.label}</TabsTrigger>)}</TabsList>; }
